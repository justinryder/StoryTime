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
      isParticipating: false,
      votes: [],
      currentVote: options.currentVote || new Vote()
    };
  }

  function Vote(options){
    options = options || {};
    return {
      value: options.value,
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
        return team.inProgressEstimation.members[i].isParticipating;
      }
    }
    return false;
  }

  function findTeamYouAreCurrentlyEstimatingWith(){
    var team = Teams.findOne({
      'inProgressEstimation.memberVotes.member.id': Meteor.userId(),
      'inProgressEstimation.memberVotes.isParticipating': true
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
        { $set: { 'inProgressEstimation.memberVotes.$.isParticipating': true } });
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
        { $set: { 'inProgressEstimation.memberVotes.$.isParticipating': false } });
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
        confirmed: true
      });

      Teams.update(
        { _id: teamId, 'inProgressEstimation.memberVotes.member.id': Meteor.userId() },
        { $set: { 'inProgressEstimation.memberVotes.$.currentVote': newVote } });
      return true;
    },
    cancelVote: function(teamId){
      if (!Meteor.user()){
        return false;
      }

      var team = findTeam(teamId);
      if (!team || !team.inProgressEstimation){
        console.log('Cannot cancel vote for teamId = ' + teamId + '. No team found or team not currently estimating. team = ', team)
        return false;
      }

      // TODO: Figure out why it works in Robomongo, but not in the app, even with the same exact query.
      Teams.update(
        { _id: teamId, 'inProgressEstimation.memberVotes.member.id': Meteor.userId() },
        { $set: { 'inProgressEstimation.memberVotes.$.currentVote.confirmed': false } });
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
        return false;
      },
      'click .cancelCurrentVote': function(event){
        Meteor.call('cancelVote', this.parent._id);
      }
    });
  // </Template.votingWidget>

  // <Template.currentEstimation>
    Template.currentEstimation.helpers({

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
      }
    });
  // </Template.currentEstimation>

  // <Template.estimationHistory>
    Template.estimationHistory.helpers({
      voteCount: function(context){
        var count = 0;
        for (var i = 0; i < this.memberVotes.length; i++){
          if (this.memberVotes[i].votes.length > count) {
            count = this.memberVotes[i].votes.length;
          }
        }
        return count + 1; // Add 1 for currentVote
      }
    });

    Template.estimationHistory.events({

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