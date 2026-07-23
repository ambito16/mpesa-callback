// require("dotenv").config();

// const express = require("express");
// const axios = require("axios");
// const bodyParser = require("body-parser");
// const { Client, Databases, Query } = require("node-appwrite");

// const app = express();
// app.use(bodyParser.json());

// // ================= APPWRITE SETUP =================

// const client = new Client()
//   .setEndpoint(process.env.APPWRITE_ENDPOINT)
//   .setProject(process.env.APPWRITE_PROJECT_ID)
//   .setKey(process.env.APPWRITE_API_KEY);

// const databases = new Databases(client);

// // ================= HEALTH CHECK =================


// app.get("/", (req, res) => {
//   console.log("🔥 GET HIT");
//   res.send("OK");
// });

// // ================= CALLBACK =================
// app.post("/callback", async (req, res) => {
//     console.log("🔥 RAW BODY:", JSON.stringify(req.body, null, 2));
//   console.log("🔥 CALLBACK RECEIVED");
//   console.log("📦 BODY:", JSON.stringify(req.body));

// //   const callback = req.body?.Body?.stkCallback;
// let callback =
//   req.body?.Body?.stkCallback ||
//   req.body?.stkCallback ||
//   null;

//   if (!callback) {
//     console.log("❌ NO CALLBACK");
//     return res.json({ ResultCode: 0 });
//   }

//   const checkoutRequestID = callback.CheckoutRequestID;
//   const resultCode = callback.ResultCode;

//   console.log("🧾 CHECKOUT ID:", checkoutRequestID);
//   console.log("🧾 RESULT:", resultCode);

//   try {
//     const payment = await databases.listDocuments(
//       process.env.APPWRITE_DATABASE_ID,
//       "payments_table",
//       [Query.equal("checkoutRequestID", checkoutRequestID)]
//     );

//     if (payment.documents.length === 0) {
//       console.log("❌ PAYMENT NOT FOUND");
//       return res.json({ ResultCode: 0 });
//     }

//     const doc = payment.documents[0];

//     if (doc.status === "paid") {
//       console.log("⚠️ ALREADY PROCESSED");
//       return res.json({ ResultCode: 0 });
//     }

//     if (resultCode === 0) {
//       const items = callback.CallbackMetadata?.Item || [];
//     //   const get = (name) => items.find(i => i.Name === name)?.Value;
//     const get = (name) => {
//   const item = items.find(i => i.Name === name);
//   return item ? item.Value : null;
// };

//       const amount = get("Amount");
//       const mpesaReceipt = get("MpesaReceiptNumber");
//     //   const phoneNumber = get("PhoneNumber");
//     const phoneNumber = String(get("PhoneNumber"));

//       await databases.updateDocument(
//   process.env.APPWRITE_DATABASE_ID,
//   "payments_table",
//   doc.$id,
//   {
//     status: "paid",
//     mpesaCode: mpesaReceipt || "",
//     amount: amount ? Number(amount) : 0,
//     phoneNumber: String(phoneNumber || ""),
//   }
// );

//       if (doc.targetMemberId) {
//         await databases.updateDocument(
//           process.env.APPWRITE_DATABASE_ID,
//           "members_table",
//           doc.targetMemberId,
//           {
//             status: "paid",
//           }
//         );
//       }

//       console.log("✅ PAYMENT SUCCESS UPDATED");
//     } else {
//       await databases.updateDocument(
//         process.env.APPWRITE_DATABASE_ID,
//         "payments_table",
//         doc.$id,
//         { status: "failed" }
//       );

//       console.log("❌ PAYMENT FAILED UPDATED");
//     }

//   } catch (err) {
//     console.error("❌ ERROR:", err.message);
//   }

//   // 🔥 ALWAYS RESPOND FAST
//   return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
// });

// // ================= START =================
// const PORT = process.env.PORT || 3000;


// // 🟢 WHATSAPP WEBHOOK
// // ============================

// // Meta webhook verification
// // Receive WhatsApp messages
// app.post("/webhook/whatsapp", async (req, res) => {
//   try {
//     console.log("📩 WhatsApp webhook received:");
//     console.log(JSON.stringify(req.body, null, 2));

//     const message =
//       req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

//     if (!message) {
//       return res.sendStatus(200);
//     }

//     const from = message.from;
//     const messageText = message.text?.body?.trim().toLowerCase();

//     console.log("📱 Message from:", from);
//     console.log("💬 Message:", messageText);

//     // Reply to Hi / Hello
//     if (
//       message.type === "text" &&
//       ["hi", "hello", "hey"].includes(messageText)
//     ) {
//       const response = await axios.post(
//         `https://graph.facebook.com/v25.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
//         {
//           messaging_product: "whatsapp",
//           to: from,
//           type: "text",
//           text: {
//             body:
//               "👋 Welcome to Karima Fraternity Welfare!\n\n" +
//               "Please choose an option:\n\n" +
//               "1️⃣ My Contributions\n" +
//               "2️⃣ My Profile\n" +
//               "3️⃣ Meeting Information\n" +
//               "4️⃣ Contact Admin\n\n" +
//               "Reply with the number of your choice."
//           }
//         },
//         {
//           headers: {
//             Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
//             "Content-Type": "application/json"
//           }
//         }
//       );

//       console.log("✅ WhatsApp reply sent:", response.data);
//     }

//     res.sendStatus(200);
//   } catch (error) {
//     console.error(
//       "❌ WhatsApp webhook error:",
//       error.response?.data || error.message
//     );

//     res.sendStatus(500);
//   }
// });
// app.listen(PORT, () => console.log(`🚀 Server running on ${PORT}`));









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

// =====================================================
// MAIN MENU
// =====================================================

async function sendMainMenu(to) {

  userSessions[to] = {
    state: "MAIN_MENU"
  };

  const message =
    "👋 Karibu Karima Fraternity Welfare!\n\n" +

    "Tafadhali chagua option:\n\n" +

    "1️⃣ My Contributions\n" +
    "2️⃣ My Profile\n" +
    "3️⃣ Meeting Information\n" +
    "4️⃣ Contact Admin\n\n" +

    "Reply with the number of your choice.";

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

    "👤 My Profile\n\n" +

    "Tafadhali ingiza:\n\n" +

    "• ID Number yako\n" +
    "au\n" +
    "• Membership Number yako\n\n" +

    "Mfano: 12345678\n" +
    "au\n" +
    "KRM001"
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
    `👋 Karibu ${fullName}!\n\n` +

    "Wewe ni member wa nguvu. 💪\n\n" +

    `Membership number yako ni ${member.membershipNumber}\n\n` +

    "━━━━━━━━━━━━━━━━━━\n\n" +

    "🔙 Rudi Nyuma\n" +
    "👨‍👩‍👧 Angalia Familia Yako\n\n" +

    "Reply:\n" +
    "1️⃣ Rudi Nyuma\n" +
    "2️⃣ Angalia Familia Yako";

  await sendWhatsAppMessage(
    to,
    message
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
      "👨‍👩‍👧‍👦 FAMILIA YAKO\n\n";

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

    message +=
      "🏠 Main Menu\n" +
      "⚠️ Probation Checker\n\n";

    message +=
      "Reply:\n" +
      "1️⃣ Main Menu\n" +
      "2️⃣ Probation Checker";

    userSessions[to] = {
      state: "FAMILY",
      memberId: memberId
    };

    await sendWhatsAppMessage(
      to,
      message
    );

  } catch (error) {

    console.error(
      "❌ Family lookup error:",
      error
    );

    await sendWhatsAppMessage(
      to,

      "❌ Samahani, kumetokea tatizo wakati wa kupata taarifa za familia yako. Tafadhali jaribu tena baadaye."
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

    // Get member

    const member =
      await databases.getDocument(
        DATABASE_ID,
        MEMBERS_COLLECTION,
        memberId
      );

    // -------------------------------------------------
    // MEMBER NOT ON PROBATION
    // -------------------------------------------------

    if (
      member.isOnProbation !== true
    ) {

      userSessions[to] = {
        state: "PROBATION",
        memberId: memberId
      };

      await sendWhatsAppMessage(
        to,

        "✅ Huna probation.\n\n" +

        "Uko sawa kabisa na michango yako. 💪\n\n" +

        "🏠 Main Menu\n\n" +

        "Reply 1️⃣ kurudi Main Menu."
      );

      return;
    }

    // -------------------------------------------------
    // MEMBER IS ON PROBATION
    // -------------------------------------------------

    const probationStart =
      member.probationStartDate;

    const probationEnd =
      member.probationEndDate;

    let contributionDescription =
      "mchango husika";

    // -------------------------------------------------
    // FIND CONTRIBUTION
    // -------------------------------------------------

    if (
      probationStart
    ) {

      const startDate =
        new Date(
          probationStart
        );

      // Get all contributions
      // and find matching deadline date

      const contributionResult =
        await databases.listDocuments(
          DATABASE_ID,
          CONTRIBUTIONS_COLLECTION,
          [
            Query.limit(20)
          ]
        );

      const matchingContribution =
        contributionResult.documents.find(
          (contribution) => {

            if (
              !contribution.deadlineDate
            ) {
              return false;
            }

            const contributionDate =
              new Date(
                contribution.deadlineDate
              );

            return (
              contributionDate.getFullYear() ===
              startDate.getFullYear() &&

              contributionDate.getMonth() ===
              startDate.getMonth() &&

              contributionDate.getDate() ===
              startDate.getDate()
            );

          }
        );

      if (
        matchingContribution
      ) {

        contributionDescription =
          matchingContribution.description ||
          matchingContribution.title ||
          "mchango husika";

      }

    }

    // -------------------------------------------------
    // FORMAT DATES
    // -------------------------------------------------

    const formattedStart =
      probationStart
        ? new Date(
            probationStart
          ).toLocaleDateString(
            "en-GB"
          )
        : "tarehe isiyojulikana";

    const formattedEnd =
      probationEnd
        ? new Date(
            probationEnd
          ).toLocaleDateString(
            "en-GB"
          )
        : "tarehe isiyojulikana";

    // -------------------------------------------------
    // MESSAGE
    // -------------------------------------------------

    const message =
      "⚠️ PROBATION STATUS\n\n" +

      `Uko probation kutoka tarehe ${formattedStart} hadi tarehe ${formattedEnd} kwa kukosa kuchanga mchango wa ${contributionDescription}.\n\n` +

      "🏠 Main Menu\n\n" +

      "Reply 1️⃣ kurudi Main Menu.";

    userSessions[to] = {
      state: "PROBATION",
      memberId: memberId
    };

    await sendWhatsAppMessage(
      to,
      message
    );

  } catch (error) {

    console.error(
      "❌ Probation check error:",
      error
    );

    await sendWhatsAppMessage(
      to,

      "❌ Samahani, hatukuweza kuangalia probation status yako kwa sasa. Tafadhali jaribu tena baadaye."
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
        message.type !== "text"
      ) {

        await sendWhatsAppMessage(
          from,

          "🙏 Tafadhali tuma ujumbe wa maandishi pekee."
        );

        return res.sendStatus(200);

      }

      const messageText =
        message.text?.body
          ?.trim()
          .toLowerCase();

      console.log(
        "📱 Message from:",
        from
      );

      console.log(
        "💬 Message:",
        messageText
      );

      // ------------------------------------------------
      // GET CURRENT SESSION
      // ------------------------------------------------

      const session = userSessions[from];

console.log(
  "🧠 ALL USER SESSIONS:",
  JSON.stringify(userSessions, null, 2)
);

console.log(
  "🧠 SESSION FOR THIS USER:",
  from,
  session
);

      // =================================================
      // HI / HELLO / HEY
      // =================================================

      if (
        ["hi", "hello", "hey"]
          .includes(messageText)
      ) {

        await sendMainMenu(
          from
        );

        return res.sendStatus(
          200
        );
      }

      // =================================================
      // NO SESSION
      // =================================================

      if (!session) {

        await sendMainMenu(
          from
        );

        return res.sendStatus(
          200
        );
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

          await sendWhatsAppMessage(
            from,

            "💰 My Contributions\n\n" +

            "🚧 Huduma hii bado inatengenezwa.\n\n" +

            "Tafadhali chagua option nyingine."
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

            "📞 Contact Admin\n\n" +

            "🚧 Taarifa za admin bado zinawekwa."
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

          "❌ Option uliyochagua haipo.\n\n" +

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

            "❌ Samahani.\n\n" +

            "Hatujaweza kupata member mwenye ID Number au Membership Number uliyoingiza.\n\n" +

            "Tafadhali hakikisha umeandika nambari sahihi na ujaribu tena.\n\n" +

            "Mfano:\n" +
            "12345678\n" +
            "au\n" +
            "KRM001"
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
      // PROFILE MENU
      // =================================================

      if (
        session.state ===
        "PROFILE"
      ) {

        // ------------------------------------------------
        // RUDI NYUMA
        // ------------------------------------------------

        if (
          messageText === "1"
        ) {

          await sendMainMenu(
            from
          );

          return res.sendStatus(
            200
          );
        }

        // ------------------------------------------------
        // FAMILY
        // ------------------------------------------------

        if (
          messageText === "2"
        ) {

          await showFamily(
            from,
            session.memberId
          );

          return res.sendStatus(
            200
          );
        }

        await sendWhatsAppMessage(
          from,

          "❌ Tafadhali chagua:\n\n" +

          "1️⃣ Rudi Nyuma\n" +
          "2️⃣ Angalia Familia Yako"
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

        // ------------------------------------------------
        // MAIN MENU
        // ------------------------------------------------

        if (
          messageText === "1"
        ) {

          await sendMainMenu(
            from
          );

          return res.sendStatus(
            200
          );
        }

        // ------------------------------------------------
        // PROBATION CHECKER
        // ------------------------------------------------

        if (
          messageText === "2"
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

          "❌ Tafadhali chagua:\n\n" +

          "1️⃣ Main Menu\n" +
          "2️⃣ Probation Checker"
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

        if (
          messageText === "1"
        ) {

          await sendMainMenu(
            from
          );

          return res.sendStatus(
            200
          );
        }

        await sendWhatsAppMessage(
          from,

          "🏠 Reply 1️⃣ kurudi Main Menu."
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