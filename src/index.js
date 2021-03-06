/**
    Copyright 2014-2015 Amazon.com, Inc. or its affiliates. All Rights Reserved.

    Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance with the License. A copy of the License is located at

        http://aws.amazon.com/apache2.0/

    or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
*/

/**
 * App ID for the skill
 */
//var APP_ID =  "amzn1.ask.skill.3498e299-c62e-4251-bdcd-42925085447d"; //replace with "amzn1.echo-sdk-ams.app.[your-unique-value-here]";
//var APP_ID =  "amzn1.ask.skill.7194f497-0309-40f3-b80b-991b667d4f1f"; // new app_id
var APP_ID = "amzn1.ask.skill.0d40f034-24b8-46c5-83a5-da8b2768fe98"; // new app_id with updated schema

/**
 * The AlexaSkill prototype and helper functions
 */
var AlexaSkill = require('./AlexaSkill');
var http = require('http');

/**
 * CapitalOne is a child of AlexaSkill.
 * To read more about inheritance in JavaScript, see the link below.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Introduction_to_Object-Oriented_JavaScript#Inheritance
 */
var CapitalOne = function () {
    AlexaSkill.call(this, APP_ID);
};

var dollars = null;                                           //dollar amount for current transfer
var cents = null;                                             //cent amount for current transfer
var friend = null;                                            //friend name for current transfer
var transferTo = [];                                          //customer list of people on friends list that match the name of friend variable
var accounts = [];                                            //accounts of the selected customer on friends list
var multipleFriendsFlag = false;                              //true if multiple friends with the same name
var multipleAccountsFlag = false;
var acc_type = null;                      // can either be checking or savings
//var url = "http://capitalone-rest-api.herokuapp.com/api/";  // old rest api url
var url = "http://psu-capitalone-api.herokuapp.com/api/";     // new rest api url
//var myId = "580e9b9ed15f730003173037";                      // old customer id -- //hardcoded id of customer for demonstration purposes
var myId = "58c35798f36d281631b3bf81";              // new customer id
//var myAccount = "5821240e17d9f90003c29f82";                 // old account id -- //hardcoded id of account to transfer from for demonstration purposes
var myAccount = "58c3554bf36d281631b3bf48";           // new account id
/*///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//    To remove hardcoded id's, account linking will need to be implemented. The details for account linking can be seen at:
//      https://developer.amazon.com/public/solutions/alexa/alexa-skills-kit/docs/linking-an-alexa-user-with-a-user-in-your-system
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////*/
// Extend AlexaSkill
CapitalOne.prototype = Object.create(AlexaSkill.prototype);
CapitalOne.prototype.constructor = CapitalOne;

CapitalOne.prototype.eventHandlers.onSessionStarted = function (sessionStartedRequest, session) {
    console.log("CapitalOne onSessionStarted requestId: " + sessionStartedRequest.requestId
        + ", sessionId: " + session.sessionId);
    // any initialization logic goes here
};

CapitalOne.prototype.eventHandlers.onLaunch = function (launchRequest, session, response) {
    console.log("CapitalOne onLaunch requestId: " + launchRequest.requestId + ", sessionId: " + session.sessionId);
    var speechOutput = "Welcome to Capital One! You can perform banking transactions.";
    response.ask(speechOutput, "Say something like transfer five dollars and three cents to Bob");
};

CapitalOne.prototype.eventHandlers.onSessionEnded = function (sessionEndedRequest, session) {
    console.log("CapitalOne onSessionEnded requestId: " + sessionEndedRequest.requestId
        + ", sessionId: " + session.sessionId);
    resetSavedValues();
    // any cleanup logic goes here
};

CapitalOne.prototype.intentHandlers = {
  "TransferIntent": function (intent, session, response) {
    dollars = intent.slots.dollar_amount.value;   //overwrite old dollar amount
    cents = intent.slots.cent_amount.value;       //overwrite old cents amount
    friend = intent.slots.friend_name.value;      //overwrite old friend's name
    transferTo = [];                              //empty potential transferees
    accounts = [];                                //empty any existing accounts
    multipleFriendsFlag = false;                  //reset flag so it can be recalculated
    multipleAccountsFlag = false;                 //reset flag so it can be recalculated

    //change dollars to null for easy coding
    if (dollars == "" || isNaN(dollars)) {
       dollars = null;
    }
    //change cents to null for easy coding
    if (cents == "" || isNaN(cents)) {
       cents = null;
    }

    //Invalid transfer because both cents and dollars were not understood properly
    if (dollars == null && cents == null) {
       response.tellWithoutEnd("I couldn't understand that. Please try your transfer again.");
       return;
    }

    // No friend is found
    if (!friend){
      response.tellWithoutEnd("No friend identified. Please try your transfer again.");
      return;
    }

    //Negative dollar amount, dollar amount greater than 5000 or cent amount out of range of 0 to 100
    if ((dollars != null && dollars <= 0) || (dollars != null && dollars > 5000) || (cents != null && (cents < 0 || cents >= 100))) {
       resetSavedValues();
       response.tellWithoutEnd("I couldn't understand that. Please try your transfer again with a valid amount between 0 and 5000 dollars.");
       return;
    } else {
      getFriendsList(myId, function(friends) { //http request to get friend customer id's matching name friend
        //no matching friend on friends list
        if (friends == null || (friends != null && friends.length == 0)) {
          response.tell("I couldn't access your friends list. Please try your transfer again.");
          return;
        } else { //found a matching friend name
          var friendCount = friends.length;     //length of friends with matching name
          var responseCount = 0;                //customer object count currently retrieved

          //go through all friend id's and get the customer object for each
          for (var i = 0; i < friends.length; i++) {
            //http request to get friend object
            getCustomer(friends[i], function(obj) { //make sure customer exists before we try to get account
              responseCount++;      //customer object retrieved, increment responseCount
              
              //push a good object onto potential transferees
              //this was still returning objects ({ error: "customer does not exist"}) if a customer
              //was not in the db, and it was trying to find a firstname for that object
              //either do some check for obj.error != null, so we know that the customer was actually
              //found since error property will only be != null if the customer exists, or we just
              //assume that no account holder can have a friend that does not exist in the db...
              //we will assume this for now
              console.log("friends.length is: " + friends.length);
              if (obj != null && obj.first_name.toLowerCase() == friend.toLowerCase()) {
                transferTo.push(obj);
              }
              //last response was retrieved, we can now check for multiple friends or accounts
              if (responseCount == friendCount) {
                var multipleFriendsObj = getMultipleFriends();    //get multiple friends teller object
                tellerMethod(multipleFriendsObj, response);       //tell the multiple friends teller object (user will then go to chooseNumberIntent)
                if (multipleFriendsObj != null) {           //stop the program if we told a response (should not hit this point unless some error occured)
          return;                 
                }

                //at this point we know we only have one candidate friend (multiple friends would go
                //to chooseNumberIntent) but friend might have multiple accounts
                //this GETS ANY ACCOUNTS WITH THIS CUSTOMER ID
                getAccounts(transferTo[0]._id, function(accountsObj) { //http request to get accounts of the transferee
                  console.log("::: In TransferIntent ::: (line 150) accountsObj.length is " + accountsObj.length + " ::: accountsObj.")
                  accounts = [];
                  //accounts.push(accountsObj);                   //push on account object
                  accounts = accountsObj.slice(); // accountsObj is a list, so the line above was pushing a list onto a list; just copy to accounts
                  var multipleAccountsObj = getMultipleAccounts();
                    tellerMethod(multipleAccountsObj, response);      //tell the multiple accounts teller object (user will then go to chooseNumberIntent)
                  if (multipleAccountsObj != null) { //stop the program if we told a reponse (should not hit this point unless some error occured)
                    return;
                  }

                  //at this point we know the one friend only has one candidate account

                  if (accounts.length == 0) { //tell response for zero accounts --- redundant, getMultipleAccounts check this already
                    response.tell("I couldn't access " + friend + "'s accounts. Please try again later.");
                    return;
                  } else { //user will respond with confirm or deny, sending them to ConfirmTransferIntent or DenyTransferIntent
                    response.tellWithoutEnd("Would you like to transfer " + formatMoney(dollars, cents) + " to " + transferTo[0].first_name + 
                      " " + transferTo[0].last_name + "? Please say complete transfer or cancel transfer.");
                    return;
                  }
                });
              }
            });
          }
        }
      });
    }
  },

  "ConfirmTransferIntent": function (intent, session, response) {
    //tell multiple friends response
    if (multipleFriendsFlag) {
      tellerMethod(getMultipleFriends(), response);
      return;
    }
    //tell multiple accounts response
    else if (multipleAccountsFlag) {
      tellerMethod(getMultipleAccounts(), response);
      return;
    }
    //valid transfer, post the transfer
    else if (dollars != null || cents != null) {
      //post transfer to rest api
      console.log("::: In confirm : before POST ::: accounts.length is " + accounts.length + 
        " ::: accounts[0].first_name is " + accounts[0].first_name);
      postTransfer(function (postResponse) {
        postResponse = JSON.parse(postResponse);        //get object from response
        //an error occured with the post, tell the error and log to alexa app
        if (postResponse != null && postResponse.error != null) {
          resetSavedValues();
          response.tellWithCard(postResponse.error);
          return;
        }
        //successful transfer, tell the success and log to alexa app
        else if (postResponse != null && postResponse.success != null) {
          var responseString = "Transferred " + formatMoney(dollars, cents) + " to " + transferTo[0].first_name + " " + transferTo[0].last_name + ".";
          resetSavedValues();
          response.tellWithCard(responseString);
          return;
        }
      });
      return;
    }
    //warn there was no transfer pending, wait for another action
    else {
      response.tellWithoutEnd("There is no transfer pending approval.");
      return;
    }
  },

  "DenyTransferIntent": function (intent, session, response) {
      //if values exist, clear them, end session
      if (dollars != null || cents != null) {
          resetSavedValues();
          response.tell("Cancelling previous account transfer.");
          return;
      }
      //tell no values existed and end session
      else {
          response.tell("There is no transfer pending approval.");
          return;
      }
  },

  "ChooseNumberIntent": function (intent, session, response) {
      //selection of multiple friends
      if (multipleFriendsFlag) {
        //warn of incorrect range
        if (intent.slots.number.value < 0 || intent.slots.number.value >= transferTo.length) {
            response.tellWithoutEnd("That number is not within the correct range. Please select a number between 0 and " + (transferTo.length - 1));
            return;
        }
        //correct selection range, make state changes to reflect selection
        else {
            var selectedObj = transferTo[intent.slots.number.value];
            transferTo = [];
            transferTo.push(selectedObj);   //put selected object as the first and only object in the transferees array
            multipleFriendsFlag = false;    //multiple friends is no longer true
            //get the accounts for this friend
            getAccounts(transferTo[0]._id, function(accountsObj) {
              accounts = [];
              accounts.push(accountsObj);           //push on account object
              var multipleAccountsObj = getMultipleAccounts();    //this is code for multiple accounts, however this was not implemented in
                                                                  //  the rest api. This has been tested and could be used for later adaptation.
              tellerMethod(multipleAccountsObj, response);    //tell the multiple accounts teller object
              //stop the program if we told a reponse
              if (multipleAccountsObj != null) {
                return;
              }
              response.tellWithoutEnd("Would you like to transfer " + formatMoney(dollars, cents) + " to " + transferTo[0].first_name + " " + transferTo[0].last_name + "? Please say complete transfer or cancel transfer.");
              return;
            });
        }
      }
      //selection of multiple friends
      else if (multipleAccountsFlag) {
        //warn of incorrect range
        if (intent.slots.number.value < 0 || intent.slots.number.value >= accounts.length) {
          response.tellWithoutEnd("That number is not within the correct range. Please select a number between 0 and " + (accounts.length - 1));
          return;
        }
        //correct selection range, make state changes to reflect selection
        else {
          var selectedObj = accounts[intent.slots.number.value];
          accounts = [];
          accounts.push(selectedObj);       //put selected object as the first and only object in the accounts array
          multipleAccountsFlag = false;     //multiple accounts is no longer true
          response.tellWithoutEnd("Would you like to transfer " + formatMoney(dollars, cents) + " to " + transferTo[0].first_name + " " + transferTo[0].last_name + " " + accounts[0].type + " account? Please say complete transfer or cancel transfer.");
          return;
        }
      }
      //no options required selection
      else {
        response.tell("Please make sure you have a pending transfer before selecting any additional options.");
        return;
      }
  },

  // check account balances of the currently logged on customer, which is hardcoded for demonstration purposes
  "BalanceEnquiryIntent": function (intent, session, response) {
  getAccounts(myId, function(accountObjs) {
    var balance = null;
    var responseString = null;
    if (accountObjs == null) {
      response.tell("Sorry, no accounts exist.");
    } else if (accountObjs.length == 1) {
         balance = accountObjs[0].balance;
         response.tell("Your balance is " + formatMoney(Math.floor(balance), Math.round(100 * (balance - Math.floor(balance)))));
         return;
    } else if (accountObjs.length > 1) {
      responseString = "You have " + accountObjs.length + "accounts. ";
      for (var i = 0; i < accountObjs.length; i++) {
        balance = accountObjs[i].balance;
        responseString += "Your balance for " + accountObjs[i].nickname + " is " + formatMoney(Math.floor(balance),
              Math.round(100 * (balance - Math.floor(balance)))) + ". ";
      }
      response.tell(responseString);
      return;
    }
  });
  },

  "AMAZON.HelpIntent": function (intent, session, response) {
      response.ask("You can perform bank transactions.", "You can perform bank transactions. Try something like, transfer ten dollars and fifty cents to John");
  },

  // create new savings/checking account under the same customerID (i.e. the one currently logged on, which
  // which is hardcoded in this case)
  "CreateNewAccountIntent": function (intent, session, response) {
    acc_type = intent.slots.account_type.value;
    if ((acc_type == "savings") || (acc_type == "checking") || (acc_type == "credit card")) { // if user wants to create savings or checking account
      postAccount(function(postResponse) {
        postResponse = JSON.parse(postResponse); //get object from response
          //an error occured with the post, tell the error and log to alexa app
          if (postResponse != null && postResponse.error != null) {
            resetSavedValues();
            response.tellWithCard(postResponse.error);
            return;
          }
          //successful creation, tell the success and log to alexa app
          else if (postResponse != null && postResponse.success != null) {
            var responseString = "Successfully created new " + acc_type + " account.";
            resetSavedValues();
            response.tellWithCard(responseString);
            return;
          }
      });
      return;
    } else { // if user did not say savings or checking
      resetSavedValues();
      response.tell("Invalid account type. Please try again.");
    }
  }
};

//http request for friends list
//PRE:    customerId is the id of the customer to get the friends list for and
//          callback is a function that receives the response object as an argument.
//POST:   The function calls callback with either an empty array or success array.
function getFriendsList(customerId, callback) {
  http.get(url + "customers/" + customerId + "/friends", function(message) {
      var body = '';
      message.on('data', function(d) {
        body += d;
      });
      message.on('end', function() {
        callback(JSON.parse(body));
      });
      message.on('error', function() {
        console.log(message);
        var returnArr = [];
        callback(returnArr);
      });
  });
}

//http request for accounts
//PRE:    customerId is the id of the customer to get the accounts for and
//          callback is a function that receives the response object as an argument.
//POST:   The function calls callback with either an empty array or success array.
function getAccounts(customerId, callback) {
  http.get(url + "customers/" + customerId + "/account", function(message) {
      var body = '';
      message.on('data', function(d) {
        body += d;
      });
      message.on('end', function() {
        callback(JSON.parse(body));
      });
      message.on('error', function() {
        console.log(message);
        //var returnArr = [];
        var returnArr = null;
        callback(returnArr);
      });
  });
}

//method used for telling response objects
//PRE:    response is the session response variable and
//tellObj objects are in the form of:
//  tellObj = {
//    tell: "tell|tellWithoutEnd|tellWithCard|ask|askWithCard",
//    responseString: "responseText"
//  }
//POST:   tellObj.responseString has been told in the method specified by tellObj.tell
function tellerMethod(tellObj, response) {
  if (tellObj != null) {
    if (tellObj.tell == "tell") {
      response.tell(tellObj.responseString);
    }
    else if (tellObj.tell == "tellWithoutEnd") {
      response.tellWithoutEnd(tellObj.responseString);
    }
    else if (tellObj.tell == "tellWithCard") {
      response.tellWithCard(tellObj.responseString);
    }
    else if (tellObj.tell == "ask") {
      response.ask(responseString, responseString);
    }
    else if (tellObj.tell == "askWithCard") {
      response.askWithCard(responseString, responseString);
    }
  }
}

//get teller object for multiple accounts
//POST:     A teller object is returned if more than one account or no account was found, otherwise returns null. The multipleAccountsFlag flag is set.
function getMultipleAccounts() {
  var responseString = "";
  //no accounts found
  if (accounts.length == 0) {
    responseString = "I couldn't find any accounts for " + friend;
    return {"tell": "tell", "responseString": responseString};
  }
  //multiple accounts found
  else if (accounts.length > 1) {
    multipleAccountsFlag = true;
    //format response string for options
    responseString += transferTo[0].first_name + " " + transferTo[0].last_name + " has more than one account. Say ";

     for (var i = 0; i < accounts.length; i++) {
        responseString += i + " for " + accounts[i].type;
        if (i + 1 != accounts.length) {
           responseString += ", ";
        }
        else {
           responseString += ".";
        }
     }
     return {"tell": "tellWithoutEnd", "responseString": responseString};
  }

  return null;  //one account found
}

//get teller object for multiple friends
//POST:     A teller object is returned if more than one friend is found with the name friend or no friend was found,
//            otherwise returns null. The multipleFriendsFlag flag is set.
function getMultipleFriends() {
  var responseString = "";
  //no friends found
  if (transferTo.length == 0) {
     responseString = "I couldn't find anyone on your friends list with the name " + friend;
     return {"tell": "tell", "responseString": responseString};
  }
  //multiple friends found
  else if (transferTo.length > 1) {
     multipleFriendsFlag = true;
     //format response string for options
     responseString = "You have multiple friends with the name " + friend + ". Say ";
     for (var j = 0; j < transferTo.length; j++)
     {
        responseString += j + " for " + friend + " " + transferTo[j].last_name;
        if (j + 1 != transferTo.length) {
           responseString += ", ";
        }
        else {
           responseString += ".";
        }
     }
     return {"tell": "tellWithoutEnd", "responseString": responseString};
  }

  return null;  //one friend found
}

//http request for a customer object
//PRE:    customerId is the id of the customer to get the object for and
//          callback is a function that receives the response object as an argument.
//POST:   The function calls callback with either a null object when there is an error or a success object.
function getCustomer(customerId, callback) {
   http.get(url + "customers/" + customerId, function(message) {
      var body = '';
      message.on('data', function(d) {
         body += d;
      });
      message.on('end', function() {
         var customerObj = JSON.parse(body);
         callback(customerObj);
      });
      message.on('error', function() {
         console.log(message);
         callback(null);
      });
   });
}

//http request to post the current transfer
//PRE:    accounts is not empty, dollars or cents is not null, and callback is a function that receives the response object as an argument
//POST:   The function calls callback with the response object.
function postTransfer(callback) {
  if (cents == null) {
    postCents = "0";
  }
  else if (cents < 10) {
    postCents = "0" + cents;
  }
  else {
    postCents = cents;
  }
  //formate transfer into post object
  var transfer_data = JSON.stringify({
    "type": "p2p",
    "sender": myAccount,
    "receiver": accounts[0]._id,
    "amount": parseFloat((dollars == null ? 0 : dollars) + "." + postCents),
    "description": "Transfer from " + myAccount + " to " + accounts[0]._id
  });

  //specify post options
  var options = {
    hostname: 'psu-capitalone-api.herokuapp.com',
    port: 80,
    path: '/api/accounts/' + myAccount + '/transfers',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(transfer_data)
    }
  };

  //perform http request for post
  var req = http.request(options, function(res) {
    res.setEncoding('utf8');
    var postResponse = "";
    res.on('data', function (body) {
      postResponse += body;
    });
    res.on('end', function () {
      console.log("--- Ended here ::: postResponse: " + postResponse);
      callback(postResponse);
    });
  }).write(transfer_data);
}

//http request to post the new account
//PRE:    acc_type is either checking or savings
//POST:   The function calls callback with the response object.
function postAccount(callback) {
  //formate new account into post object
  // (nickname + Math.floor will cast the number to string to make random nicknames)
  // we can add intent to specify nicknames later b/c it might not let us create another acc
  // if the random num generator happens to land on the same number twice (since we compare
  // by nicknames in routes/account/)
  var account_data = JSON.stringify({
  "type": acc_type,
  "nickname": "account" + Math.floor(Math.random() * 1000),
  "rewards": 0,
  "balance": 0.0,
  "account_number": Math.floor(Math.random() * 100000),
  "customer_id": myId
  });

  //specify post options
  var options = {
    hostname: 'psu-capitalone-api.herokuapp.com',
    port: 80,
    path: '/api/customers/' + myId + '/account',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(account_data)
    }
  };

  //perform http request for post
  var req = http.request(options, function(res) {
    res.setEncoding('utf8');
    var postResponse = "";
    res.on('data', function (body) {
      postResponse += body;
    });
    res.on('end', function () {
      callback(postResponse);
    });
  }).write(account_data);
}

//formatMoney puts dollars and cents into word form
//PRE:    dollars or cents is not null.
//POST:   the appropriate word form of money is returned.
function formatMoney(dollars, cents) {
   var responseString = "";

   if (dollars != null && cents != null) {
      responseString += dollars + " dollar" + (dollars == "1" ? "" : "s") + " and " + cents + " cent" + (cents == "1" ? "" : "s")
   }
   else if (dollars != null) {
      responseString += dollars + " dollar" + (dollars == "1" ? "" : "s")
    }
   else if (cents != null) {
      responseString += cents + " cent" + (cents == "1" ? "" : "s")
   }

   return responseString;
}

//reset all saved session values
//POST:    all session values have been restored to default.
function resetSavedValues() {
   dollars = null;
   cents = null;
   friend = null;
   transferTo = [];
   accounts = [];
   multipleFriendsFlag = false;
   multipleAccountsFlag = false;
   acc_type = null;
}

// Create the handler that responds to the Alexa Request.
exports.handler = function (event, context) {
    // Create an instance of the CapitalOne skill.
    var capitalOne = new CapitalOne();
    capitalOne.execute(event, context);
};

