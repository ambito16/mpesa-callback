
require("dotenv").config();

const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const { Client, Databases, Query } = require("node-appwrite");

const app = express();
app.use(bodyParser.json());

// =====================================================
// APPWRITE SETUP
// =====================================================

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);

// =====================================================
// APPWRITE DATABASE ID
// =====================================================

const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;

// =====================================================
// COLLECTION NAMES
// =====================================================

const MEMBERS_COLLECTION = "members_table";
const PAYMENTS_COLLECTION = "payments_table";
const CONTRIBUTIONS_COLLECTION = "contributions_table";

const SPOUSES_COLLECTION = "spouses";
const CHILDREN_COLLECTION = "children";
const PARENTS_COLLECTION = "parents";
const NEXT_OF_KIN_COLLECTION = "nextOfKin";

// =====================================================
// WHATSAPP USER SESSIONS
// =====================================================

// This temporarily remembers what each WhatsApp user is doing.
//
// Example:
// userSessions["254712345678"] = {
//   state: "AWAITING_PROFILE_LOOKUP"
// }

const userSessions = {};

// =====================================================
// HEALTH CHECK
// =====================================================

app.get("/", (req, res) => {
  console.log("🔥 GET HIT");
  res.send("OK");
});

// =====================================================
// M-PESA CALLBACK
// =====================================================

app.post("/callback", async (req, res) => {
  console.log(
    "🔥 RAW BODY:",
    JSON.stringify(req.body, null, 2)
  );

  console.log("🔥 CALLBACK RECEIVED");

  console.log(
    "📦 BODY:",
    JSON.stringify(req.body)
  );

  let callback =
    req.body?.Body?.stkCallback ||
    req.body?.stkCallback ||
    null;

  if (!callback) {
    console.log("❌ NO CALLBACK");
    return res.json({
      ResultCode: 0
    });
  }

  const checkoutRequestID =
    callback.CheckoutRequestID;

  const resultCode =
    callback.ResultCode;

  console.log(
    "🧾 CHECKOUT ID:",
    checkoutRequestID
  );

  console.log(
    "🧾 RESULT:",
    resultCode
  );

  try {
    const payment =
      await databases.listDocuments(
        DATABASE_ID,
        PAYMENTS_COLLECTION,
        [
          Query.equal(
            "checkoutRequestID",
            checkoutRequestID
          )
        ]
      );

    if (payment.documents.length === 0) {
      console.log(
        "❌ PAYMENT NOT FOUND"
      );

      return res.json({
        ResultCode: 0
      });
    }

    const doc =
      payment.documents[0];

    if (doc.status === "paid") {
      console.log(
        "⚠️ ALREADY PROCESSED"
      );

      return res.json({
        ResultCode: 0
      });
    }

    // =================================================
    // SUCCESSFUL PAYMENT
    // =================================================

    if (resultCode === 0) {
      const items =
        callback.CallbackMetadata?.Item || [];

      const get = (name) => {
        const item =
          items.find(
            (i) => i.Name === name
          );

        return item
          ? item.Value
          : null;
      };

      const amount =
        get("Amount");

      const mpesaReceipt =
        get("MpesaReceiptNumber");

      const phoneNumber =
        String(
          get("PhoneNumber") || ""
        );

      await databases.updateDocument(
        DATABASE_ID,
        PAYMENTS_COLLECTION,
        doc.$id,
        {
          status: "paid",
          mpesaCode:
            mpesaReceipt || "",
          amount:
            amount
              ? Number(amount)
              : 0,
          phoneNumber:
            phoneNumber
        }
      );

      if (doc.targetMemberId) {
        await databases.updateDocument(
          DATABASE_ID,
          MEMBERS_COLLECTION,
          doc.targetMemberId,
          {
            status: "paid"
          }
        );
      }

      console.log(
        "✅ PAYMENT SUCCESS UPDATED"
      );

    } else {

      // =================================================
      // FAILED PAYMENT
      // =================================================

      await databases.updateDocument(
        DATABASE_ID,
        PAYMENTS_COLLECTION,
        doc.$id,
        {
          status: "failed"
        }
      );

      console.log(
        "❌ PAYMENT FAILED UPDATED"
      );
    }

  } catch (err) {

    console.error(
      "❌ ERROR:",
      err.message
    );
  }

  // ALWAYS RESPOND FAST

  return res.json({
    ResultCode: 0,
    ResultDesc: "Accepted"
  });
});

// =====================================================
// WHATSAPP HELPER FUNCTIONS
// =====================================================

// -----------------------------------------------------
// SEND WHATSAPP MESSAGE
// -----------------------------------------------------

async function sendWhatsAppMessage(
  to,
  message
) {
  try {

    const response =
      await axios.post(
        `https://graph.facebook.com/v25.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          messaging_product:
            "whatsapp",

          to: to,

          type: "text",

          text: {
            body: message
          }
        },
        {
          headers: {
            Authorization:
              `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,

            "Content-Type":
              "application/json"
          }
        }
      );

    console.log(
      "✅ WhatsApp message sent:",
      response.data
    );

  } catch (error) {

    console.error(
      "❌ WhatsApp send error:",
      error.response?.data ||
      error.message
    );

    throw error;
  }
}

async function sendWhatsAppButtons(to, bodyText, buttons) {
  await axios.post(
    `https://graph.facebook.com/v25.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: to,
      type: "interactive",
      interactive: {
        type: "button",
        body: {
          text: bodyText
        },
        action: {
          buttons: buttons.map((button) => ({
            type: "reply",
            reply: {
              id: button.id,
              title: button.title
            }
          }))
        }
      }
    },
    {
      headers: {
        Authorization:
          `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type":
          "application/json"
      }
    }
  );
}

// =====================================================
// MAIN MENU
// =====================================================

async function sendMainMenu(to) {

  // -----------------------------------------------
  // CHECK IF WE ALREADY KNOW THIS MEMBER
  // -----------------------------------------------

  const existingSession =
    userSessions[to];

  if (
    existingSession?.memberId
  ) {

    userSessions[to] = {
      state: "MAIN_MENU",
      memberId:
        existingSession.memberId
    };

  } else {

    userSessions[to] = {
      state: "MAIN_MENU"
    };

  }

  const message =
    "👋    *Karibu Karima Fraternity!*\n\n" +

    "_Tafadhali chagua option:_\n\n" +

    "1️⃣ My Contributions\n" +
    "2️⃣ My Profile\n" +
    "3️⃣ Meeting Information\n" +
    "4️⃣ Contact Admin\n\n" +

    "_Reply with the number of your choice._";

  await sendWhatsAppMessage(
    to,
    message
  );
}

// =====================================================
// PROFILE LOOKUP REQUEST
// =====================================================

async function askForProfileLookup(
  to
) {

  userSessions[to] = {
    state:
      "AWAITING_PROFILE_LOOKUP"
  };

  await sendWhatsAppMessage(
    to,

    "👤 *My Profile*\n\n" +

    "Tafadhali weka:\n\n" +

    "• ID Number yako. *Ama*\n" +
  
    "• Membership Number yako\n\n" +

    "Mfano: 12345678 *Ama* 013"
  );
}

// =====================================================
// FIND MEMBER
// =====================================================

async function findMember(
  lookup
) {

  const cleanLookup =
    String(lookup)
      .trim();

  console.log(
    "🔎 Searching member:",
    cleanLookup
  );

  // First search by ID number

  let result =
    await databases.listDocuments(
      DATABASE_ID,
      MEMBERS_COLLECTION,
      [
        Query.equal(
          "idNumber",
          cleanLookup
        )
      ]
    );

  if (
    result.documents.length > 0
  ) {

    return result.documents[0];

  }

  // If not found, search
  // by membership number

  result =
    await databases.listDocuments(
      DATABASE_ID,
      MEMBERS_COLLECTION,
      [
        Query.equal(
          "membershipNumber",
          cleanLookup
        )
      ]
    );

  if (
    result.documents.length > 0
  ) {

    return result.documents[0];

  }

  return null;
}

// =====================================================
// GET MEMBER FOR WHATSAPP SESSION
// =====================================================

async function getMemberForSession(
  to
) {

  const session =
    userSessions[to];

  // -----------------------------------------------
  // MEMBER ALREADY IDENTIFIED
  // -----------------------------------------------

  if (
    session?.memberId
  ) {

    try {

      const member =
        await databases.getDocument(
          DATABASE_ID,
          MEMBERS_COLLECTION,
          session.memberId
        );


        console.log(
  "✅ MEMBER FOUND:",
  JSON.stringify(
    member,
    null,
    2
  )
);

console.log(
  "📅 PROBATION START:",
  member.probationStartDate
);

console.log(
  "📅 PROBATION END:",
  member.probationEndDate
);

console.log(
  "⚠️ IS ON PROBATION:",
  member.isOnProbation
);

      return member;

    } catch (error) {

      console.error(
        "❌ Saved member no longer found:",
        error.message
      );

      // Clear invalid member ID

      delete userSessions[to].memberId;

      return null;
    }
  }

  return null;
}

// =====================================================
// DISPLAY MEMBER PROFILE
// =====================================================

async function showMemberProfile(
  to,
  member
) {

  // Save currently selected member

  userSessions[to] = {
    state: "PROFILE",
    memberId: member.$id
  };

  const fullName =
    [
      member.firstName,
      member.secondName,
      member.lastName
    ]
      .filter(Boolean)
      .join(" ");

  const message =
    `👋 *Karibu ${fullName}!*\n\n` +

    "Wewe ni member wa nguvu. 💪\n\n" +

    `🆔 Membership Number: *${member.membershipNumber}*\n\n` +

    "━━━━━━━━━━━━━━━━━━\n\n" +

    "Chagua option hapa chini:";

  await sendWhatsAppButtons(
    to,
    message,
    [
      {
        id: "main_menu",
        title: "🏠 Main Menu"
      },
      {
        id: "family_menu",
        title: "👨‍👩‍👧 Familia Yako"
      }
    ]
  );
}

// =====================================================
// FAMILY LOOKUP
// =====================================================

async function getFamily(
  memberId
) {

  console.log(
    "👨‍👩‍👧 Getting family for:",
    memberId
  );

  // ---------------------------------------------------
  // SPOUSE
  // ---------------------------------------------------

  const spouseResult =
    await databases.listDocuments(
      DATABASE_ID,
      SPOUSES_COLLECTION,
      [
        Query.equal(
          "membersTable",
          memberId
        )
      ]
    );

  // ---------------------------------------------------
  // CHILDREN
  // ---------------------------------------------------

  const childrenResult =
    await databases.listDocuments(
      DATABASE_ID,
      CHILDREN_COLLECTION,
      [
        Query.equal(
          "membersTable",
          memberId
        )
      ]
    );

  // ---------------------------------------------------
  // PARENTS
  // ---------------------------------------------------

  const parentsResult =
    await databases.listDocuments(
      DATABASE_ID,
      PARENTS_COLLECTION,
      [
        Query.equal(
          "membersTable",
          memberId
        )
      ]
    );

  // ---------------------------------------------------
  // NEXT OF KIN
  // ---------------------------------------------------

  const nextOfKinResult =
    await databases.listDocuments(
      DATABASE_ID,
      NEXT_OF_KIN_COLLECTION,
      [
        Query.equal(
          "membersTable",
          memberId
        )
      ]
    );

  return {

    spouses:
      spouseResult.documents,

    children:
      childrenResult.documents,

    parents:
      parentsResult.documents,

    nextOfKin:
      nextOfKinResult.documents

  };
}

// =====================================================
// FORMAT FAMILY MEMBER NAME
// =====================================================

function formatRelationshipName(
  person
) {

  return [
    person.firstName,
    person.secondName,
    person.thirdName
  ]
    .filter(Boolean)
    .join(" ");
}

// =====================================================
// DISPLAY FAMILY
// =====================================================

async function showFamily(
  to,
  memberId
) {

  try {

    const family =
      await getFamily(
        memberId
      );

    let message =
      "👨‍👩‍👧‍👦 *FAMILIA YAKO*\n\n";

    // -------------------------------------------------
    // SPOUSE
    // -------------------------------------------------

    if (
      family.spouses.length > 0
    ) {

      family.spouses.forEach(
        (person) => {

          message +=
            `💍 Spouse: ${formatRelationshipName(person)}\n`;

        }
      );

    }

    // -------------------------------------------------
    // CHILDREN
    // -------------------------------------------------

    if (
      family.children.length > 0
    ) {

      family.children.forEach(
        (person) => {

          message +=
            `👧 Child: ${formatRelationshipName(person)}\n`;

        }
      );

    }

    // -------------------------------------------------
    // PARENTS
    // -------------------------------------------------

    if (
      family.parents.length > 0
    ) {

      family.parents.forEach(
        (person) => {

          let relationship =
            person.relationshipType;

          if (
            relationship ===
            "mother"
          ) {

            relationship =
              "Mother";

          } else if (
            relationship ===
            "father"
          ) {

            relationship =
              "Father";

          } else if (
            relationship ===
            "mother_in_law"
          ) {

            relationship =
              "Mother in Law";

          } else if (
            relationship ===
            "father_in_law"
          ) {

            relationship =
              "Father in Law";

          }

          message +=
            `👤 ${relationship}: ${formatRelationshipName(person)}\n`;

        }
      );

    }

    // -------------------------------------------------
    // NEXT OF KIN
    // -------------------------------------------------

    if (
      family.nextOfKin.length > 0
    ) {

      family.nextOfKin.forEach(
        (person) => {

          message +=
            `👤 Next of Kin: ${formatRelationshipName(person)}\n`;

        }
      );

    }

    // -------------------------------------------------
    // NO FAMILY FOUND
    // -------------------------------------------------

    if (
      family.spouses.length === 0 &&
      family.children.length === 0 &&
      family.parents.length === 0 &&
      family.nextOfKin.length === 0
    ) {

      message +=
        "Hakuna taarifa ya familia iliyopatikana.\n";

    }

    message +=
      "\n━━━━━━━━━━━━━━━━━━\n\n";

    // message +=
    //   "🏠 Main Menu\n" +
    //   "⚠️ Probation Checker\n\n";

    // message +=
    //   "Reply:\n" +
    //   "1️⃣ Main Menu\n" +
    //   "2️⃣ Probation Checker";

    userSessions[to] = {
      state: "FAMILY",
      memberId: memberId
    };

    // await sendWhatsAppMessage(
    //   to,
    //   message
    // );
    await sendWhatsAppButtons(
  to,
  message,
  [
    {
      id: "main_menu",
      title: "🏠 Main Menu"
    },
    {
      id: "probation_checker",
      title: "⚠️ Probation Checker"
    }
  ]
);

  } catch (error) {

    console.error(
      "❌ Family lookup error:",
      error
    );

    await sendWhatsAppMessage(
      to,

      "❌ Pole sana, System iko na issue kidogo. Tafadhali jaribu tena masaa inengi."
    );
  }
}

// =====================================================
// PROBATION CHECKER
// =====================================================

async function checkProbation(
  to,
  memberId
) {

  try {

    console.log(
      "⚠️ Checking probation:",
      memberId
    );

    // =================================================
    // GET MEMBER
    // =================================================

    const member =
      await databases.getDocument(
        DATABASE_ID,
        MEMBERS_COLLECTION,
        memberId
      );

      console.log(
  "👤 FULL MEMBER DOCUMENT:",
  JSON.stringify(
    member,
    null,
    2
  )
);

    // =================================================
    // MEMBER NOT ON PROBATION
    // =================================================

    console.log(
  "🔍 CHECKING PROBATION CONDITION"
);

    console.log(
  "⚠️ isOnProbation value:",
  member.isOnProbation
);

console.log(
  "⚠️ isOnProbation type:",
  typeof member.isOnProbation
);

console.log(
  "🚨 NEW PROBATION CODE VERSION 28"
);

console.log(
  "📅 START DATE FROM APPWRITE:",
  member.probationStartDate
);

if (
  member.isOnProbation !== true &&
  member.isOnProbation !== "true"
) {

      userSessions[to] = {
        state: "PROBATION",
        memberId: memberId
      };

      const message =
        "✅ PROBATION STATUS\n\n" +

        "*Hauko probation wewe.*\n\n" +

        "Uko sawa kabisa na contributions zako. 💪\n\n" +

        "Chagua option hapa chini:";

      await sendWhatsAppButtons(
        to,
        message,
        [
          {
            id: "main_menu",
            title: "🏠 Main Menu"
          }
        ]
      );

      return;
    }

    
  // =================================================
// GET MISSED CONTRIBUTION
// =================================================

// console.log(
//   "📌 CONTRIBUTION ID FROM MEMBER:",
//   member.contributionId
// );

// let formattedStart =
//   "tarehe isiyojulikana";

// let formattedEnd =
//   "tarehe isiyojulikana";

// let contributionDescription =
//   "mchango husika";

// if (
//   member.contributionId
// ) {

//   const contribution =
//     await databases.getDocument(
//       DATABASE_ID,
//       CONTRIBUTIONS_COLLECTION,
//       member.contributionId
//     );

//   console.log(
//     "✅ MISSED CONTRIBUTION FOUND:",
//     JSON.stringify(
//       contribution,
//       null,
//       2
//     )
//   );

//   // Get the contribution deadline

//   const startDate =
//     contribution.deadlineDate
//       ? new Date(
//           contribution.deadlineDate
//         )
//       : null;

//   // Create the WhatsApp probation end date

//   const endDate =
//     startDate
//       ? new Date(
//           startDate
//         )
//       : null;

//   // Add ONE YEAR

//   if (
//     endDate
//   ) {

//     endDate.setFullYear(
//       endDate.getFullYear() + 1
//     );

//   }

//   // Format start date

//   if (
//     startDate
//   ) {

//     formattedStart =
//       startDate.toLocaleDateString(
//         "en-GB",
//         {
//           day: "numeric",
//           month: "long",
//           year: "numeric"
//         }
//       );

//   }

//   // Format end date

//   if (
//     endDate
//   ) {

//     formattedEnd =
//       endDate.toLocaleDateString(
//         "en-GB",
//         {
//           day: "numeric",
//           month: "long",
//           year: "numeric"
//         }
//       );

//   }

//   // Get contribution description

//   contributionDescription =
//     contribution.description ||
//     contribution.title ||
//     "mchango husika";

// } else {

//   console.log(
//     "❌ NO contributionId FOUND ON MEMBER"
//   );

// }

// =================================================
// GET MISSED CONTRIBUTION
// =================================================

let formattedStart = "tarehe isiyojulikana";
let formattedEnd = "tarehe isiyojulikana";
let contributionDescription = "mchango husika";

// Get all expired contributions (latest first)

const contributionsResult =
  await databases.listDocuments(
    DATABASE_ID,
    CONTRIBUTIONS_COLLECTION,
    [
      Query.lessThan(
        "deadlineDate",
        new Date().toISOString()
      ),
      Query.orderDesc("deadlineDate"),
      Query.limit(100)
    ]
  );

for (const contribution of contributionsResult.documents) {

  // Check if member paid this contribution

  const paymentResult =
    await databases.listDocuments(
      DATABASE_ID,
      PAYMENTS_COLLECTION,
      [
        Query.equal("memberId", member.$id),
        Query.equal("contributionId", contribution.$id),
        Query.equal("status", "paid"),
        Query.limit(1)
      ]
    );

  // If no payment exists, this is the missed contribution

  if (paymentResult.documents.length === 0) {

    const startDate = new Date(
      contribution.deadlineDate
    );

    const endDate = new Date(
      contribution.deadlineDate
    );

    // WhatsApp probation = 1 year

    endDate.setFullYear(
      endDate.getFullYear() + 1
    );

    formattedStart =
      startDate.toLocaleDateString(
        "en-GB",
        {
          day: "numeric",
          month: "long",
          year: "numeric"
        }
      );

    formattedEnd =
      endDate.toLocaleDateString(
        "en-GB",
        {
          day: "numeric",
          month: "long",
          year: "numeric"
        }
      );

    contributionDescription =
      contribution.description ||
      contribution.title ||
      "mchango husika";

    console.log(
      "✅ MISSED CONTRIBUTION:",
      contribution.$id
    );

    console.log(
      "📅 DEADLINE:",
      contribution.deadlineDate
    );

    break;
  }
}
    // =================================================
    // PROBATION MESSAGE
    // =================================================

    const message =
  "⚠️ PROBATION STATUS\n\n" +

  `Uko probation kutoka tarehe ${formattedStart} ` +
  `hadi tarehe ${formattedEnd} ` +
  `kwa kukosa kuchangia ${contributionDescription}. ` +
  `Tafadhali thibitisha na Treasurer.\n\n` +

  "Chagua option hapa chini:";

    userSessions[to] = {
      state: "PROBATION",
      memberId: memberId
    };

    await sendWhatsAppButtons(
      to,
      message,
      [
        {
          id: "main_menu",
          title: "🏠 Main Menu"
        }
      ]
    );

  } catch (error) {

    // console.error(
    //   "❌ Probation check error:",
    //   error
    // );
    console.error(
  "❌ PROBATION ERROR MESSAGE:",
  error.message
);

console.error(
  "❌ PROBATION ERROR RESPONSE:",
  error.response?.data
);

console.error(
  "❌ FULL PROBATION ERROR:",
  error
);

    await sendWhatsAppMessage(
      to,

      "❌ Samahani, hatukuweza kuangalia probation status yako kwa sasa. Tafadhali jaribu tena baadaye."
    );
  }
}


    // =====================================================
// GET ACTIVE CONTRIBUTION
// =====================================================


async function getActiveContribution() {

  const now =
    new Date();

  const result =
    await databases.listDocuments(
      DATABASE_ID,
      CONTRIBUTIONS_COLLECTION,
      [
        Query.limit(20)
      ]
    );

  const activeContribution =
    result.documents.find(
      (contribution) => {

        if (
          !contribution.startDate ||
          !contribution.deadlineDate
        ) {

          return false;

        }

        const startDate =
          new Date(
            contribution.startDate
          );

        const deadlineDate =
          new Date(
            contribution.deadlineDate
          );

        return (
          now >= startDate &&
          now <= deadlineDate
        );

      }
    );

  return activeContribution || null;
}



// =====================================================
// CHECK MEMBER PAYMENT
// =====================================================

async function hasMemberPaid(
  memberId,
  contributionId
) {

  const result =
    await databases.listDocuments(
      DATABASE_ID,
      PAYMENTS_COLLECTION,
      [
        Query.equal(
          "memberId",
          memberId
        ),

        Query.equal(
          "contributionId",
          contributionId
        ),

        Query.equal(
          "status",
          "paid"
        ),

        Query.limit(1)
      ]
    );

  return (
    result.documents.length > 0
  );
}


        // =====================================================
// CALCULATE DAYS LEFT
// =====================================================

function getDaysLeft(
  deadlineDate
) {

  const now =
    new Date();

  const deadline =
    new Date(
      deadlineDate
    );

  const difference =
    deadline.getTime() -
    now.getTime();

  const days =
    Math.ceil(
      difference /
      (
        1000 *
        60 *
        60 *
        24
      )
    );

  return Math.max(
    days,
    0
  );
}

// =====================================================
// DISPLAY CONTRIBUTIONS
// =====================================================

async function showContributions(
  to,
  memberId
) {

  try {

    console.log(
      "💰 Showing contributions for:",
      memberId
    );

    // -----------------------------------------------
    // GET ACTIVE CONTRIBUTION
    // -----------------------------------------------

    const activeContribution =
      await getActiveContribution();

    // -----------------------------------------------
    // GET ALL CONTRIBUTIONS
    // -----------------------------------------------

    const contributionResult =
      await databases.listDocuments(
        DATABASE_ID,
        CONTRIBUTIONS_COLLECTION,
        [
          Query.limit(20)
        ]
      );

    const contributions =
      contributionResult.documents;

    // -----------------------------------------------
    // SORT LATEST FIRST
    // -----------------------------------------------

    contributions.sort(
      (a, b) => {

        const dateA =
          new Date(
            a.startDate ||
            a.$createdAt
          );

        const dateB =
          new Date(
            b.startDate ||
            b.$createdAt
          );

        return (
          dateB - dateA
        );

      }
    );

    let message =
      "💰 *CONTRIBUTIONS*\n\n";

    // =================================================
    // ACTIVE CONTRIBUTION
    // =================================================

    if (
      activeContribution
    ) {

      const paid =
        await hasMemberPaid(
          memberId,
          activeContribution.$id
        );

      const daysLeft =
        getDaysLeft(
          activeContribution.deadlineDate
        );

      message +=
  `1️⃣ ${activeContribution.description || ""}: ${activeContribution.title}\n\n`;

      if (
        paid
      ) {

        message +=
          "✅ Wewe umelipa tayari.\n\n";

      } else {

        message +=
          "❌ Wewe bado hujalipa.\n\n" +

          `Je! Ungependa kulipa sa hizi?\n` +

          `⏳ Kumbuka: Imebakia siku ${daysLeft} hadi deadline.\n\n`;

      }

    }

    // =================================================
    // PREVIOUS CONTRIBUTIONS
    // =================================================

    const previousContributions =
      contributions.filter(
        (contribution) => {

          if (
            !activeContribution
          ) {

            return true;

          }

          return (
            contribution.$id !==
            activeContribution.$id
          );

        }
      );

    if (
      previousContributions.length > 0
    ) {

      message +=
        "━━━━━━━━━━━━━━━━━━\n\n" +

        "📜 *PREVIOUS CONTRIBUTIONS*\n\n";

      previousContributions.forEach(
        (contribution, index) => {

          message +=
            `${index + 1}️⃣ ${contribution.title}\n`;

        }
      );

    }

    // =================================================
    // NO CONTRIBUTIONS
    // =================================================

    if (
      !activeContribution &&
      previousContributions.length === 0
    ) {

      message +=
        "Hakuna taarifa ya michango iliyopatikana.\n\n";

    }

    // =================================================
    // SAVE SESSION
    // =================================================

    userSessions[to] = {
      state: "CONTRIBUTIONS",
      memberId: memberId
    };

    // =================================================
    // SEND MESSAGE
    // =================================================

    await sendWhatsAppButtons(
      to,
      message,
      [
        {
          id: "make_payment",
          title: "💰 Lipa Saa hii"
        },
        {
          id: "main_menu",
          title: "🏠 Main Menu"
        }
      ]
    );

  } catch (error) {

    console.error(
      "❌ Contributions error:",
      error.response?.data ||
      error.message ||
      error
    );

    await sendWhatsAppMessage(
      to,

      "❌ Samahani, hatukuweza kupata taarifa za michango yako kwa sasa. Tafadhali jaribu tena baadaye."
    );

  }
}
// =====================================================
// WHATSAPP WEBHOOK
// =====================================================

app.post(
  "/webhook/whatsapp",
  async (req, res) => {

    try {

      console.log(
        "📩 WhatsApp webhook received:"
      );

      console.log(
        JSON.stringify(
          req.body,
          null,
          2
        )
      );

      const message =
        req.body?.entry?.[0]
          ?.changes?.[0]
          ?.value
          ?.messages?.[0];

      // ------------------------------------------------
      // Ignore non-message webhook events
      // ------------------------------------------------

      if (!message) {

        return res.sendStatus(200);

      }

      // ------------------------------------------------
      // GET USER NUMBER
      // ------------------------------------------------

      const from =
        message.from;

      // ------------------------------------------------
      // ONLY PROCESS TEXT
      // ------------------------------------------------

      if (
  message.type !== "text" &&
  message.type !== "interactive"
) {
  return res.sendStatus(200);
}

     const messageText =
  message.text?.body?.trim().toLowerCase() ||
  message.interactive?.button_reply?.id ||
  "";

      // ------------------------------------------------
      // GET CURRENT SESSION
      // ------------------------------------------------

     if (
  ["hi", "hello", "hey"].includes(messageText)
) {
  await sendMainMenu(from);
  return res.sendStatus(200);
}

const session = userSessions[from];

console.log(
  "🔍 CURRENT SESSION BEFORE PROCESSING:",
  JSON.stringify(session, null, 2)
);

console.log(
  "🔍 MESSAGE TEXT:",
  messageText
);

console.log(
  "🧠 ALL USER SESSIONS:",
  JSON.stringify(userSessions, null, 2)
);

console.log(
  "🧠 SESSION FOR THIS USER:",
  from,
  session
);

if (!session) {
  await sendMainMenu(from);
  return res.sendStatus(200);
}
      // =================================================
      // MAIN MENU
      // =================================================

      if (
        session.state ===
        "MAIN_MENU"
      ) {

      // ------------------------------------------------
// 1 - CONTRIBUTIONS
// ------------------------------------------------

if (
  messageText === "1"
) {

  // Member already identified
  if (
    session.memberId
  ) {

    await showContributions(
      from,
      session.memberId
    );

    return res.sendStatus(
      200
    );
  }

  // First time: ask for ID or Membership Number

  userSessions[from] = {
    state:
      "AWAITING_CONTRIBUTIONS_LOOKUP"
  };

  await sendWhatsAppMessage(
    from,

    "💰 *Contributions*\n\n" +

    "Tafadhali thibitisha utambulisho wako kwa kuweka:\n\n" +

    "• ID Number yako\n" +
    "au\n" +
    "• Membership Number yako\n\n" +

    "Mfano:\n" +
    "12345678 au *001*\n"
  );

  return res.sendStatus(
    200
  );
}

        // ------------------------------------------------
        // 2 - PROFILE
        // ------------------------------------------------

        if (
          messageText === "2"
        ) {

          await askForProfileLookup(
            from
          );

          return res.sendStatus(
            200
          );
        }

        // ------------------------------------------------
        // 3 - MEETING INFORMATION
        // ------------------------------------------------

        if (
          messageText === "3"
        ) {

          await sendWhatsAppMessage(
            from,

            "📅 Meeting Information\n\n" +

            "🚧 Huduma hii bado inatengenezwa."
          );

          return res.sendStatus(
            200
          );
        }

        // ------------------------------------------------
        // 4 - CONTACT ADMIN
        // ------------------------------------------------

        if (
          messageText === "4"
        ) {

          await sendWhatsAppMessage(
            from,

            "📞 *Contact Admin*\n\n" +

            "🚧 Portal ya ofisi bado inatengenezwa."
          );

          return res.sendStatus(
            200
          );
        }

        // ------------------------------------------------
        // INVALID MENU OPTION
        // ------------------------------------------------

        await sendWhatsAppMessage(
          from,

          "❌ *Option umechagua haipo.*\n\n" +

          "Tafadhali reply na 1, 2, 3 au 4."
        );

        return res.sendStatus(
          200
        );
      }

      // =================================================
      // AWAITING PROFILE LOOKUP
      // =================================================

      if (
        session.state ===
        "AWAITING_PROFILE_LOOKUP"
      ) {

        const member =
          await findMember(
            messageText
          );

        // ------------------------------------------------
        // MEMBER NOT FOUND
        // ------------------------------------------------

        if (!member) {

          await sendWhatsAppMessage(
            from,

            "❌ *Samahani.*\n\n" +

            "Hatujaweza kupata member mwenye ID Number au Membership Number uliyoingiza.\n\n" +

            "Tafadhali hakikisha umeandika nambari sahihi na ujaribu tena.\n\n" +

            "Mfano:\n" +
            "12345678 *Ama* 035\n" 
          );

          return res.sendStatus(
            200
          );
        }

        // ------------------------------------------------
        // MEMBER FOUND
        // ------------------------------------------------

        await showMemberProfile(
          from,
          member
        );

        return res.sendStatus(
          200
        );
      }

      // =================================================
// AWAITING CONTRIBUTIONS LOOKUP
// =================================================

if (
  session.state ===
  "AWAITING_CONTRIBUTIONS_LOOKUP"
) {

  const member =
    await findMember(
      messageText
    );

  if (!member) {

    await sendWhatsAppMessage(
      from,

      "❌ Samahani.\n\n" +

      "Sijaweza kupata member mwenye ID Number ama Membership Number umeweka.\n\n" +

      "Tafadhali hakikisha umeandika namba iko sawa na ujaribu tena."
    );

    return res.sendStatus(
      200
    );
  }

  // Save member identity
  // so we don't ask again
  userSessions[from] = {
    state: "CONTRIBUTIONS",
    memberId: member.$id
  };

  await showContributions(
    from,
    member.$id
  );

  return res.sendStatus(
    200
  );
}


// =================================================
// CONTRIBUTIONS MENU
// =================================================

if (
  session.state ===
  "CONTRIBUTIONS"
) {

  // -------------------------------------------------
  // LIPA SASA
  // -------------------------------------------------

  if (
    messageText === "make_payment"
  ) {

    userSessions[from] = {
      state:
        "AWAITING_MPESA_NUMBER",

      memberId:
        session.memberId
    };

    await sendWhatsAppMessage(
      from,

      "💰 *LIPA SASA*\n\n" +

      "Tafadhali weka nambari ya M-Pesa utakayotumia kulipa.\n\n" +

      "Mfano:\n" +
      "0712345678"
    );

    return res.sendStatus(
      200
    );
  }


  // =================================================
// AWAITING MPESA NUMBER
// =================================================

// if (
//   session.state ===
//   "AWAITING_MPESA_NUMBER"
// ) {

//   console.log("🔥 ENTERED AWAITING_MPESA_NUMBER BLOCK");

//   const mpesaNumber =
//     messageText;

//     console.log("🔥 MPESA NUMBER:", mpesaNumber);

//   // Basic phone validation

//   if (
//   !/^(07\d{8}|2547\d{8})$/.test(
//     mpesaNumber
//   )
// ) {

//     await sendWhatsAppMessage(
//       from,

//       "❌ Nambari ya M-Pesa si sahihi.\n\n" +

//       "Tafadhali weka nambari sahihi.\n\n" +

//       "Mfano:\n" +
//       "0712345678"
//     );

//     return res.sendStatus(
//       200
//     );
//   }

//   console.log(
//     "📱 M-Pesa number received:",
//     mpesaNumber
//   );

//   // =================================================
//   // GET ACTIVE CONTRIBUTION
//   // =================================================

//   const activeContribution =
//     await getActiveContribution();

//   if (!activeContribution) {

//     await sendWhatsAppMessage(
//       from,

//       "❌ Hakuna mchango unaoendelea kwa sasa."
//     );

//     return res.sendStatus(
//       200
//     );
//   }

//   // =================================================
//   // SEND STK PUSH
//   // =================================================

//   try {

//     await sendWhatsAppMessage(
//       from,

//       "⏳ Tafadhali subiri...\n\n" +

//       "Tunatuma ombi la malipo kwa nambari yako ya M-Pesa."
//     );

//     console.log(
//       "🚀 Calling STK Push Function..."
//     );

//     const stkResponse =
//       await axios.post(
//         process.env.STK_PUSH_FUNCTION_URL,

//         {
//           phoneNumber:
//             mpesaNumber,

//           amount:
//             activeContribution.amountPerMember,

//           accountRef:
//             activeContribution.title,

//           memberId:
//             session.memberId,

//           contributionId:
//             activeContribution.$id,

//           targetMemberId:
//             session.memberId,

//           payerId:
//             session.memberId
//         }
//       );

//     console.log(
//       "📥 STK FUNCTION RESPONSE:",
//       stkResponse.data
//     );

//     if (
//       !stkResponse.data?.success
//     ) {

//       throw new Error(
//         stkResponse.data?.error ||
//         "STK Push failed"
//       );

//     }

//     // =================================================
//     // SAVE PAYMENT SESSION
//     // =================================================

//     userSessions[from] = {
//       state:
//         "PAYMENT_PENDING",

//       memberId:
//         session.memberId,

//       mpesaNumber:
//         mpesaNumber,

//       contributionId:
//         activeContribution.$id,

//       contributionTitle:
//         activeContribution.title
//     };

//     await sendWhatsAppMessage(
//       from,

//       "📲 STK Push imetumwa!\n\n" +

//       "Tafadhali angalia simu yako na uweke M-Pesa PIN yako kukamilisha malipo."
//     );

//   } catch (error) {

//     console.error(
//       "❌ STK Push ERROR:",
//       error.response?.data ||
//       error.message ||
//       error
//     );

//     await sendWhatsAppMessage(
//       from,

//       "❌ Samahani, hatukuweza kuanzisha malipo kwa sasa.\n\n" +

//       "Tafadhali jaribu tena baadaye."
//     );

//   }

//   return res.sendStatus(
//     200
//   );
// }

  // -------------------------------------------------
  // MAIN MENU
  // -------------------------------------------------

  if (
    messageText === "main_menu"
  ) {

    await sendMainMenu(
      from
    );

    return res.sendStatus(
      200
    );
  }

  // -------------------------------------------------
  // INVALID OPTION
  // -------------------------------------------------

  await sendWhatsAppMessage(
    from,

    "❌ Tafadhali tumia button iliyo chini."
  );

  return res.sendStatus(
    200
  );
}

      // =================================================
// PROFILE MENU
// =================================================

if (
  session.state ===
  "PROFILE"
) {

  // ------------------------------------------------
  // MAIN MENU BUTTON
  // ------------------------------------------------

  if (
    messageText === "main_menu"
  ) {

    await sendMainMenu(
      from
    );

    return res.sendStatus(
      200
    );
  }

  // ------------------------------------------------
  // FAMILY BUTTON
  // ------------------------------------------------

  if (
    messageText === "family_menu"
  ) {

    await showFamily(
      from,
      session.memberId
    );

    return res.sendStatus(
      200
    );
  }

  // ------------------------------------------------
  // INVALID RESPONSE
  // ------------------------------------------------

  await sendWhatsAppMessage(
    from,

    "❌ Tafadhali tumia button iliyo chini."
  );

  return res.sendStatus(
    200
  );
}
      // =================================================
      // FAMILY MENU
      // =================================================

      if (
  session.state ===
  "FAMILY"
) {

  if (
    messageText === "main_menu"
  ) {

    await sendMainMenu(
      from
    );

    return res.sendStatus(
      200
    );
  }

  if (
    messageText === "probation_checker"
  ) {

    await checkProbation(
      from,
      session.memberId
    );

    return res.sendStatus(
      200
    );
  }

  await sendWhatsAppMessage(
    from,

    "❌ Tafadhali tumia button iliyo chini."
  );

  return res.sendStatus(
    200
  );
}

     // =================================================
// PROBATION MENU
// =================================================

if (
  session.state ===
  "PROBATION"
) {

  // ------------------------------------------------
  // MAIN MENU BUTTON
  // ------------------------------------------------

  if (
    messageText === "main_menu"
  ) {

    await sendMainMenu(
      from
    );

    return res.sendStatus(
      200
    );
  }

  // ------------------------------------------------
  // INVALID RESPONSE
  // ------------------------------------------------

  await sendWhatsAppMessage(
    from,

    "❌ Tafadhali tumia button iliyo chini."
  );

  return res.sendStatus(
    200
  );
}

      // =================================================
      // FALLBACK
      // =================================================

      await sendMainMenu(
        from
      );

      res.sendStatus(
        200
      );

    } catch (error) {

      console.error(
        "❌ WhatsApp webhook error:",

        error.response?.data ||
        error.message ||
        error
      );

      res.sendStatus(
        500
      );
    }
  }
);

// =====================================================
// START SERVER
// =====================================================

const PORT =
  process.env.PORT || 3000;

app.listen(
  PORT,
  () => {

    console.log(
      `🚀 Server running on ${PORT}`
    );

  }
);