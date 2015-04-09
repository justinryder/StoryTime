Teams = new Mongo.Collection('Teams');

// <models>
  function Team(options){
    options = options || {};
    return {
      name: options.name,
      description: options.description,
      estimationUnits: options.estimationUnits,
      members: options.members || [],
      inProgressEstimation: null,
      completedEstimations: [],
      dateIn: new Date(),
      createdBy: Meteor.userId()
    };
  }

  // A member of a team.
  // If no options are specified, creates a TeamMember for the current user
  function TeamMember(options){
    return options ? {
      id: options.id,
      name: options.name
    } : {
      id: Meteor.userId(),
      name: getUserName()
    };
  }

  function Story(options){
    options = options || {};
    return {
      name: options.name,
      link: options.link,
      description: options.description
    };
  }

  function Estimation(options){
    options = options || {};
    options.story = options.story || new Story();
    return {
      result: options.result,
      units: options.units,
      story: new Story(options.story),
      // Who was on team when vote occurred
      memberVotes: options.memberVotes || []
    };
  }

  // Info about a member and the votes they have made as part of an Estimation
  function MemberVote(options){
    return {
      member: options.member,
      votes: [],
      currentVote: options.currentVote || new Vote()
    };
  }

  function Vote(options){
    options = options || {};
    return {
      value: options.value,
      isParticipating: options.isParticipating || false,
      agreed: options.agreed || false,
      confirmed: options.confirmed || false
    };
  }
// </models>

// <helpers>
  function getUserName(){
    var user = Meteor.user();
    if (!user){
      return null;
    }
    // accounts-ui or account-google
    return user.username || user.profile.name;
  }

  function findTeam(teamId){
    if (!teamId){
      return null;
    }
    return Teams.findOne({ _id: teamId });
  }

  function isCurrentUserParticipating(team){
    for (var i = 0; i < team.inProgressEstimation.members.length; i++){
      if (team.inProgressEstimation.members[i].id == Meteor.userId()){
        return team.inProgressEstimation.members[i].currentVote.isParticipating;
      }
    }
    return false;
  }

  function findTeamYouAreCurrentlyEstimatingWith(){
    var team = Teams.findOne({
      'inProgressEstimation.memberVotes': {
        $elemMatch: {
          'member.id': Meteor.userId(),
          'currentVote.isParticipating': true
        }
      }
    });
    if (team){
      // Add parent reference to make Meteor.calls easier
      team.inProgressEstimation.parent = team;
    }
    return team;
  }

  // Converts a list of TeamMembers to a list of MemberVotes
  function teamMembersToMemberVotes(members){
    var memberVotes = [];
    for (var i = 0; i < members.length; i++){
      memberVotes.push(new MemberVote({
        member: members[i]
      }));
    }
    return memberVotes;
  }
// </helpers>

Meteor.methods({
  // <teams>
    addNewTeam: function(team){
      if (!Meteor.user()){
        return false;
      }

      var newTeam = new Team(team);
      newTeam.members.push(new TeamMember());
      Teams.insert(newTeam);
      return true;
    },
    joinTeam: function(teamId){
      if (!Meteor.user()){
        return false;
      }

      var team = findTeam(teamId);
      if (!team || team.inProgressEstimation) {
        return false;
      }

      Teams.update(
        { _id: teamId },
        { $push: { members: new TeamMember() } });
      return true;
    },
    leaveTeam: function(teamId){
      if (!Meteor.user()){
        return false;
      }

      var team = findTeam(teamId);
      if (!team || team.inProgressEstimation){
        return false;
      }

      Teams.update(
        { _id: teamId },
        { $pull: { members: { id: Meteor.userId() } } });
      return true;
    },
  // </teams>
  // <estimations>
    startNewEstimation: function(teamId){
      if (!Meteor.user()){
        return false;
      }

      var team = findTeam(teamId);
      if (!team || team.inProgressEstimation){
        console.log('Cannot start new estimation for teamId = ' + teamId + '. No team found or team is currently estimating. team = ', team)
        return false;
      }

      var estimation = new Estimation({
        units: team.estimationUnits,
        memberVotes: teamMembersToMemberVotes(team.members)
      });

      Teams.update(
        { _id: teamId, inProgressEstimation: null },
        { $set: { inProgressEstimation: estimation } });
      return true;
    },
    joinEstimation: function(teamId){
      if (!Meteor.user()){
        return false;
      }

      var team = findTeam(teamId);
      if (!team || !team.inProgressEstimation){
        console.log('Cannot join estimation for teamId = ' + teamId + '. No team found or team not currently estimating. team = ', team)
        return false;
      }

      Teams.update(
        { _id: teamId, 'inProgressEstimation.memberVotes.member.id': Meteor.userId() },
        { $set: { 'inProgressEstimation.memberVotes.$.currentVote.isParticipating': true } });
      return true;
    },
    leaveEstimation: function(teamId){
      if (!Meteor.user()){
        return false;
      }

      var team = findTeam(teamId);
      if (!team || !team.inProgressEstimation){
        console.log('Cannot leave estimation for teamId = ' + teamId + '. No team found or team not currently estimating. team = ', team)
        return false;
      }

      Teams.update(
        { _id: teamId, 'inProgressEstimation.memberVotes.member.id': Meteor.userId() },
        { $set: { 'inProgressEstimation.memberVotes.$.currentVote.isParticipating': false } });
      return true;
    },
    finalizeEstimation: function(teamId){
      if (!Meteor.user()){
        return false;
      }

      var team = findTeam(teamId);
      if (!team || !team.inProgressEstimation){
        console.log('Cannot finalize estimation for teamId = ' + teamId + '. No team found or team not currently estimating. team = ', team)
        return false;
      }

      team.inProgressEstimation.dateIn = new Date();
      team.completedEstimations.push(team.inProgressEstimation);
      team.inProgressEstimation = null;

      Teams.update(
        { _id: teamId },
        team);
      return true;
    },
    updateStory: function(teamId, story){
      if (!Meteor.userId()){
        return false;
      }

      var team = findTeam(teamId);
      if (!team || !team.inProgressEstimation){
        console.log('Cannot update story for teamId = ' + teamId + '. No team found or team not currently estimating. team = ', team)
        return false;
      }

      var newStory = new Story(story);

      Teams.update(
        { _id: teamId },
        { $set: { 'inProgressEstimation.story': newStory } });
      return true;
    },
  // </estimations>
  // <votes>
    confirmVote: function(teamId, voteValue){
      if (!Meteor.user()){
        return false;
      }

      var team = findTeam(teamId);
      if (!team || !team.inProgressEstimation){
        console.log('Cannot confirm vote for teamId = ' + teamId + '. No team found or team not currently estimating. team = ', team)
        return false;
      }

      var newVote = new Vote({
        value: voteValue,
        confirmed: true,
        isParticipating: true
      });

      Teams.update(
        { _id: teamId, 'inProgressEstimation.memberVotes.member.id': Meteor.userId() },
        { $set: { 'inProgressEstimation.memberVotes.$.currentVote': newVote } });
      return true;
    },
    showVotes: function(teamId){
      if (!Meteor.user()){
        return false;
      }

      var team = findTeam(teamId);
      if (!team || !team.inProgressEstimation){
        console.log('Cannot show votes for teamId = ' + teamId + '. No team found or team not currently estimating. team = ', team)
        return false;
      }

      var memberVotes = team.inProgressEstimation.memberVotes;
      var firstVote = memberVotes[0].currentVote.value;
      var membersAgree = true;
      for (var i = 1; i < memberVotes.length; i++){
        if (memberVotes[i].currentVote.value != firstVote){
          membersAgree = false;
          break;
        }
      }

      var result;
      memberVotes.forEach(function(memberVote){
        if (membersAgree){
          memberVote.currentVote.agreed = true;
          result = memberVote.currentVote.value;
        }

        memberVote.votes.push(memberVote.currentVote);
        memberVote.currentVote = new Vote({
          isParticipating: memberVote.currentVote.isParticipating
        });
      });

      Teams.update(
        { _id: teamId },
        { $set: {
          'inProgressEstimation.memberVotes': memberVotes,
          'inProgressEstimation.result': result
        } });
      return true;
    }
  // </votes>
});

// <session data>
  // Creates a get/set function for a session variable
  function _sessionGetSetFactory(sessionVariableName){
    return function(value){
      if (typeof value != 'undefined'){
        Session.set(sessionVariableName, value);
      }
      else{
        return Session.get(sessionVariableName);
      }
    }
  }

  var isAddingNewItem = _sessionGetSetFactory('isAddingNewTeam');
// </session data>

if (Meteor.isClient) {
  Meteor.subscribe('Teams');

  Accounts.ui.config({
    passwordSignupFields: "USERNAME_ONLY"
  });

  // <Template.body>
    Template.body.helpers({
      currentEstimationTeam: findTeamYouAreCurrentlyEstimatingWith
    });

    Template.body.events({

    });
  // </Template.body>

  // <Template.votingWidget>
    Template.votingWidget.helpers({
      yourCurrentVote: function(){
        var team = findTeamYouAreCurrentlyEstimatingWith();
        for (var i = 0; i < team.inProgressEstimation.memberVotes.length; i++){
          if (team.inProgressEstimation.memberVotes[i].member.id == Meteor.userId()){
            return team.inProgressEstimation.memberVotes[i].currentVote;
          }
        }
      }
    });

    Template.votingWidget.events({
      'submit .votingForm': function(event){
        Meteor.call('confirmVote', this.parent._id, event.target.vote.value);
        event.target.vote.value = null;
        return false;
      },
      'click .quickVote .button': function(event){
        Meteor.call('confirmVote', this.parent._id, $(event.target).data('vote'));
      }
    });
  // </Template.votingWidget>

  // <Template.currentEstimation>
    Template.currentEstimation.helpers({
      allParticipantsAgreedOnLastVote: function(){
        var memberVotes = this.inProgressEstimation.memberVotes;
        if (!memberVotes.length || !memberVotes[0].votes.length){
          return false;
        }
        for (var i = 1; i < memberVotes.length; i++){
          var vote = memberVotes[i].votes[memberVotes[i].votes.length - 1];
          if (vote.isParticipating && !vote.agreed){
            return false;
          }
        }
        return true;
      }
    });

    Template.currentEstimation.events({
      'submit .storyForm': function(event){
        var story = new Story({
          name: event.target.name.value,
          link: event.target.link.value,
          description: event.target.description.value
        });
        Meteor.call('updateStory', this.parent._id, story);
        return false;
      },
      'click .leaveEstimation': function(event){
        Meteor.call('leaveEstimation', this._id);
      },
      'click .startNewEstimationVote': function(event){
        Meteor.call('startNewEstimationVote', this._id);
      },
      'click .finalizeEstimation': function(event){
        if (this.inProgressEstimation.story.name) {
          Meteor.call('finalizeEstimation', this._id);
        }
        else {
          alert('Please enter a story name before finalizing the vote.');
        }
      }
    });
  // </Template.currentEstimation>

  // <Template.estimationHistory>
    Template.estimationHistory.helpers({
      voteCount: function(){
        var count = 0;
        for (var i = 0; i < this.memberVotes.length; i++){
          if (this.memberVotes[i].votes.length > count) {
            count = this.memberVotes[i].votes.length;
          }
        }
        return count + 1; // Add 1 for currentVote
      },
      allParticipantsHaveConfirmedTheirVotes: function(){
        for (var i = 0; i < this.memberVotes.length; i++){
          if (this.memberVotes[i].currentVote.isParticipating && !this.memberVotes[i].currentVote.confirmed){
            return false;
          }
        }
        return true;
      }
    });

    Template.estimationHistory.events({
      'click .showVotes': function(event){
        Meteor.call('showVotes', this.parent._id);
      }
    });
  // </Template.estimationHistory>

  // <Template.estimationsInProgress>
    Template.estimationsInProgress.helpers({
      yourTeamsThatAreEstimating: function(){
        return Teams.find({
          members: { $elemMatch: { id: Meteor.userId() } },
          inProgressEstimation: { $ne: null }
        });
      },
      yourTeamsThatAreNotEstimating: function(){
        return Teams.find({
          members: { $elemMatch: { id: Meteor.userId() } },
          inProgressEstimation: null
        });
      }
    });

    Template.estimationsInProgress.events({
      'click .joinEstimation': function(event){
        Meteor.call('joinEstimation', this._id);
      },
      'click .startNewEstimation': function(event){
        Meteor.call('startNewEstimation', this._id);
      }
    });
  // </Template.estimationsInProgress>

  // <Template.recentEstimations>
    Template.recentEstimations.helpers({
      recentEstimations: function(){
        var teams = Teams.find();
        var estimations = [];
        teams.forEach(function(team){
          team.completedEstimations.forEach(function(estimation){
            estimation.team = team;
          });
          Array.prototype.push.apply(estimations, team.completedEstimations);
        });
        estimations.sort(function(a, b){
          return b.dateIn - a.dateIn;
        });
        return estimations.slice(0, 5);
      }
    });

    Template.recentEstimations.events({
      
    });
  // </Tempalte.recentEstimations>

  // <Template.teams>
    Template.teams.helpers({
      isAddingNewTeam: function(){
        return isAddingNewItem();
      },
      yourTeams: function(){
        return Teams.find({ members: { $elemMatch: { id: Meteor.userId() } } });
      },
      otherTeams: function(){
        return Teams.find({
          $where: function(){
            for (var i = 0; i < this.members.length; i++){
              if (this.members[i].id == Meteor.userId()){
                return false;
              }
            }
            return true;
          }
        });
      }
    });

    Template.teams.events({
      'click .addNewTeamButton': function(event){
        isAddingNewItem(true);
      },
      'click .addNewTeamForm .cancelButton': function(event){
        isAddingNewItem(false);
      },
      'submit .addNewTeamForm': function(event){
        var team = new Team({
          name: event.target.name.value,
          description : event.target.description.value,
          estimationUnits: event.target.estimationUnits.value
        });
        Meteor.call('addNewTeam', team);
        isAddingNewItem(false);
        return false;
      },
      'click .joinTeam': function(event){
        Meteor.call('joinTeam', this._id);
      },
      'click .leaveTeam': function(event){
        Meteor.call('leaveTeam', this._id);
      }
    });
  // </Template.teams>
}

if (Meteor.isServer) {
  Meteor.publish('Teams', function(){
    return Teams.find();
  });
}