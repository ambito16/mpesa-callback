require("dotenv").config();

const express = require("express");
const bodyParser = require("body-parser");
const { Client, Databases, Query } = require("node-appwrite");

const app = express();
app.use(bodyParser.json());

// ================= APPWRITE SETUP =================

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);

// ================= HEALTH CHECK =================


app.get("/", (req, res) => {
  console.log("🔥 GET HIT");
  res.send("OK");
});

// ================= CALLBACK =================
app.post("/callback", async (req, res) => {
    console.log("🔥 RAW BODY:", JSON.stringify(req.body, null, 2));
  console.log("🔥 CALLBACK RECEIVED");
  console.log("📦 BODY:", JSON.stringify(req.body));

//   const callback = req.body?.Body?.stkCallback;
let callback =
  req.body?.Body?.stkCallback ||
  req.body?.stkCallback ||
  null;

  if (!callback) {
    console.log("❌ NO CALLBACK");
    return res.json({ ResultCode: 0 });
  }

  const checkoutRequestID = callback.CheckoutRequestID;
  const resultCode = callback.ResultCode;

  console.log("🧾 CHECKOUT ID:", checkoutRequestID);
  console.log("🧾 RESULT:", resultCode);

  try {
    const payment = await databases.listDocuments(
      process.env.APPWRITE_DATABASE_ID,
      "payments_table",
      [Query.equal("checkoutRequestID", checkoutRequestID)]
    );

    if (payment.documents.length === 0) {
      console.log("❌ PAYMENT NOT FOUND");
      return res.json({ ResultCode: 0 });
    }

    const doc = payment.documents[0];

    if (doc.status === "paid") {
      console.log("⚠️ ALREADY PROCESSED");
      return res.json({ ResultCode: 0 });
    }

    if (resultCode === 0) {
      const items = callback.CallbackMetadata?.Item || [];
    //   const get = (name) => items.find(i => i.Name === name)?.Value;
    const get = (name) => {
  const item = items.find(i => i.Name === name);
  return item ? item.Value : null;
};

      const amount = get("Amount");
      const mpesaReceipt = get("MpesaReceiptNumber");
    //   const phoneNumber = get("PhoneNumber");
    const phoneNumber = String(get("PhoneNumber"));

      await databases.updateDocument(
  process.env.APPWRITE_DATABASE_ID,
  "payments_table",
  doc.$id,
  {
    status: "paid",
    mpesaCode: mpesaReceipt || "",
    amount: amount ? Number(amount) : 0,
    phoneNumber: String(phoneNumber || ""),
  }
);

      if (doc.targetMemberId) {
        await databases.updateDocument(
          process.env.APPWRITE_DATABASE_ID,
          "members_table",
          doc.targetMemberId,
          {
            status: "paid",
          }
        );
      }

      console.log("✅ PAYMENT SUCCESS UPDATED");
    } else {
      await databases.updateDocument(
        process.env.APPWRITE_DATABASE_ID,
        "payments_table",
        doc.$id,
        { status: "failed" }
      );

      console.log("❌ PAYMENT FAILED UPDATED");
    }

  } catch (err) {
    console.error("❌ ERROR:", err.message);
  }

  // 🔥 ALWAYS RESPOND FAST
  return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
});

// ================= START =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on ${PORT}`));