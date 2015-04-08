Teams = new Mongo.Collection('Teams');

// <models>
  function Team(options){
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
      name: Meteor.user().username
    };
  }

  function Story(options){
    return {
      name: options.name,
      link: options.link,
      description: options.description
    };
  }

  function Estimation(options){
    options.story = options.story || new Story();
    return {
      result: options.result,
      units: options.units,
      story: new Story(options.story),
      // Who is actually participating right now
      members: options.members || [],
      teamVotes: options.teamVotes || [],
      currentVote: options.currentVote || null
    };
  }

  function TeamVote(options){
    return {
      memberVotes: options.memberVotes || [],
      number: options.number,
      dateIn: new Date()
    };
  }

  function MemberVote(options){
    return {
      member: options.member,
      vote: options.vote
    };
  }
// </models>

// <helpers>
  function findTeam(teamId){
    if (!teamId){
      return null;
    }
    return Teams.findOne({ _id: teamId });
  }

  // Converts a list of TeamMembers to a list of MemberVotes
  function teamMembersToMemberVotes(team){
    var members = team.members;
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
        units: team.estimationUnits
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
        { _id: teamId },
        { $push: { 'inProgressEstimation.members': new TeamMember() } });
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
        { _id: teamId },
        { $pull: { 'inProgressEstimation.members': { id: Meteor.userId() } } });
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
    startNewEstimationVote: function(teamId){
      if (!Meteor.user()){
        return false;
      }

      var team = findTeam(teamId);
      if (!team || !team.inProgressEstimation){
        console.log('Cannot start new estimation vote for teamId = ' + teamId + '. No team found or team not currently estimating. team = ', team)
        return false;
      }

      var newTeamVote = new TeamVote({
        memberVotes: teamMembersToMemberVotes(team.members),
        number: team.inProgressEstimation.teamVotes.length
      });

      Teams.update(
        { _id: teamId },
        { $set: { 'inProgressEstimation.teamVotes': newTeamVote } });
      return true;
    },
    confirmMemberVote: function(teamId, vote){
      if (!Meteor.user()){
        return false;
      }

      var team = findTeam(teamId);
      if (!team || !team.inProgressEstimation){
        console.log('Cannot confirm member vote for teamId = ' + teamId + '. No team found or team not currently estimating. team = ', team)
        return false;
      }

      Teams.update(
        { _id: teamId, 'inProgressEstimation.currentVote.memberVotes.member.id': Meteor.userId() },
        { $set: { 'inProgressEstimation.currentVote.memberVotes.$.member.vote': vote } });
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
      // The team that you are currently estimating with
      currentEstimationTeam: function(){
        var team = Teams.findOne({
          members: { $elemMatch: { id: Meteor.userId() } },
          'inProgressEstimation.members': { $elemMatch: { id: Meteor.userId() }}
        });
        if (team){
          // Add parent reference to make update story call easier
          team.inProgressEstimation.parent = team;
        }
        return team;
      }
    });

    Template.body.events({

    });
  // </Template.body>

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
      }
    });
  // </Template.currentEstimation>

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