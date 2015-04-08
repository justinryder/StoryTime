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

  function Estimation(options){
    options.story = options.story || {};
    return {
      result: options.result,
      units: options.units,
      story: {
        name: options.story.name,
        link: options.story.link,
        description: options.story.description
      },
      // Who is actually participating right now
      members: options.members || [],
      inProgressVotes: options.inProgressVotes || [],
      completedVotes: options.completedVotes || []
    };
  }

  function CompletedVote(options){
    return {
      memberVotes: options.memberVotes,
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

Meteor.methods({
  addNewTeam: function(team){
    if (!Meteor.user()){
      return;
    }

    var newTeam = new Team(team);
    newTeam.members.push(new TeamMember());
    Teams.insert(newTeam);
  },
  joinTeam: function(teamId){
    if (!Meteor.user() || !teamId){
      return;
    }

    Teams.update(
      { _id: teamId },
      { $push: { members: new TeamMember() } });
  },
  leaveTeam: function(teamId){
    if (!Meteor.user() || !teamId){
      return;
    }

    Teams.update(
      { _id: teamId },
      { $pull: { members: { id: Meteor.userId() } } });
  },
  startNewEstimation: function(teamId){
    if (!teamId){
      return;
    }

    var team = Teams.find({ _id: teamId, inProgressEstimation: null });
    if (!team){
      return;
    }

    var estimation = new Estimation({
      units: team.estimationUnits,
      members: [ new TeamMember() ]
    });

    Teams.update(
      { _id: teamId, inProgressEstimation: null },
      { $set: { inProgressEstimation: estimation } });
  },
  joinEstimation: function(teamId){
    if (!teamId){
      return;
    }

    var team = Teams.find({ _id: teamId, inProgressEstimation: { $ne: null } });
    if (!team){
      return;
    }

    Teams.update(
      { _id: teamId }
      { $push: { 'inProgressEstimation.members': new TeamMember() } });
  },
  leaveEstimation: function(teamId){
    if (!teamId){
      return;
    }

    var team = Teams.find({ _id: teamId, inProgressEstimation: { $ne: null } });
    if (!team){
      return;
    }

    Teams.update(
      { _id: teamId },
      { $pull: { 'inProgressEstimation.members': { id: Meteor.userId() } } });
  }
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
  var estimatingForTeam = _sessionGetSetFactory('estimatingForTeam');
// </session data>

if (Meteor.isClient) {
  Meteor.subscribe('Teams');

  Accounts.ui.config({
    passwordSignupFields: "USERNAME_ONLY"
  });

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
      Meteor.call('joinEstimation', $(event.target).data('id'));
    },
    'click .startNewEstimation': function(event){
      Meteor.call('startNewEstimation', $(event.target).data('id'));
    }
  });

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
      Meteor.call('joinTeam', $(event.target).data('id'));
    },
    'click .leaveTeam': function(event){
      Meteor.call('leaveTeam', $(event.target).data('id'));
    }
  });
}

if (Meteor.isServer) {
  Meteor.publish('Teams', function(){
    return Teams.find();
  });
}