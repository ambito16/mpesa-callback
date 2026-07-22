const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const cors = require("cors");
require("dotenv").config();
const sdk = require("node-appwrite");

// ---------------- APPWRITE ----------------
const client = new sdk.Client()
  .setEndpoint("https://fra.cloud.appwrite.io/v1")
  .setProject("68b1ea9c002ba37511e6")
  .setKey(process.env.APPWRITE_KEY);

const databases = new sdk.Databases(client);

// ---------------- EXPRESS ----------------
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use("/api/callback", bodyParser.text({ type: "*/*" }));
app.use(express.urlencoded({ extended: true }));

// ---------------- TOKEN ----------------
async function getToken() {
  const creds = Buffer.from(
    `${process.env.CONSUMER_KEY}:${process.env.CONSUMER_SECRET}`
  ).toString("base64");

  const { data } = await axios.get(
    "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
    { headers: { Authorization: `Basic ${creds}` } }
  );
  return data.access_token;
}

// ============================
// 🔵 PAY ROUTE (INITIATE STK)
// ============================

app.post("/api/pay", async (req, res) => {
  
  try {
    let { phone, amount, memberId, contributionId } = req.body;

    // 1️⃣ Validate phone
    if (!phone) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    if (!phone.startsWith("07") && !phone.startsWith("01")) {
      return res.status(400).json({ error: "Invalid phone number" });
    }

    // Convert to 254 format
    let phoneFormatted = phone.startsWith("0")
      ? "254" + phone.slice(1)
      : phone;

    // 2️⃣ Create pending payment in Appwrite
    const pendingPayment = await databases.createDocument(
      "6951372e001aa540c529", // Database ID
      "payments_table",
      sdk.ID.unique(),
      {
        memberId,
        contributionId,
        mpesaNumber: phoneFormatted,
        amount,
        status: "pending",
      }
    );

    // 3️⃣ STK Push
    const token = await getToken(); // your OAuth token function
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:TZ]/g, "")
      .slice(0, 14);

    const password = Buffer.from(
      process.env.SHORTCODE + process.env.PASSKEY + timestamp
    ).toString("base64");

    const { data } = await axios.post(
      "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      {
        BusinessShortCode: process.env.SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: amount,
        PartyA: phoneFormatted,
        PartyB: process.env.SHORTCODE,
        PhoneNumber: phoneFormatted,
        CallBackURL: `${process.env.PUBLIC_URL}/api/callback`, // must be ngrok URL
        AccountReference: contributionId,
        TransactionDesc: "Contribution payment",
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    // 4️⃣ Save CheckoutRequestID
    await databases.updateDocument(
      "6951372e001aa540c529",
      "payments_table",
      pendingPayment.$id,
      {
        checkoutRequestId: data.CheckoutRequestID,
      }
    );
    console.log("STK Sent:", data.CheckoutRequestID);
    res.json(data); // return STK push response to frontend
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "STK Push failed" });
  }
});



// app.post("/api/pay", async (req, res) => {
//   try {
//     let { phone, amount, memberId, contributionId } = req.body;

//     // Validate phone
//     if (!phone.startsWith("07") && !phone.startsWith("01")) {
//       return res.status(400).json({ error: "Invalid phone number" });
//     }

//     // Convert to 254 format
//     let phoneFormatted = phone.startsWith("0")
//       ? "254" + phone.slice(1)
//       : phone;

//     // 1️⃣ Create pending payment
//     const pendingPayment = await databases.createDocument(
//       "6951372e001aa540c529",
//       "payments_table",
//       sdk.ID.unique(),
//       {
//         memberId,
//         contributionId,
//         mpesaNumber: phoneFormatted,
//         amount,
//         status: "pending",
//       }
//     );

//     // 2️⃣ STK Push
//     const token = await getToken();
//     const timestamp = new Date()
//       .toISOString()
//       .replace(/[-:TZ]/g, "")
//       .slice(0, 14);

//     const password = Buffer.from(
//       process.env.SHORTCODE + process.env.PASSKEY + timestamp
//     ).toString("base64");

//     const { data } = await axios.post(
//       "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
//       {
//         BusinessShortCode: process.env.SHORTCODE,
//         Password: password,
//         Timestamp: timestamp,
//         TransactionType: "CustomerPayBillOnline",
//         Amount: amount,
//         PartyA: phoneFormatted,
//         PartyB: process.env.SHORTCODE,
//         PhoneNumber: phoneFormatted,
//         CallBackURL: `${process.env.PUBLIC_URL}/api/callback`,
//         AccountReference: contributionId,
//         TransactionDesc: "Contribution payment",
//       },
//       { headers: { Authorization: `Bearer ${token}` } }
//     );

//     // 3️⃣ SAVE CheckoutRequestID (CRITICAL FIX)
//     await databases.updateDocument(
//       "6951372e001aa540c529",
//       "payments_table",
//       pendingPayment.$id,
//       {
//         checkoutRequestId: data.CheckoutRequestID,
//       }
//     );

//     console.log("STK Sent:", data.CheckoutRequestID);
//     res.json(data);
//   } catch (err) {
//     console.error(err.response?.data || err.message);
//     res.status(500).json({ error: "STK Push failed" });
//   }
// });

// ============================
// 🟢 CALLBACK (CONFIRM PAYMENT)
// ============================


// app.post("/api/callback", async (req, res) => {
//   try {
//     // const raw = req.body;
//     // const data = JSON.parse(raw);
//     const data = req.body;


//     const callback = data.Body?.stkCallback;
//     // if (!callback) return res.status(200).send("OK");
//     // if (!callback) return res.status(200).json({ success: true });


//     // console.log("Callback:", callback);

//     // if (callback.ResultCode === "0") {
//     //   console.log("ResultCode:", callback.ResultCode);

//     //   const checkoutId = callback.CheckoutRequestID;
//     //   const metadata = callback.CallbackMetadata.Item;

//     //   const amount = metadata.find(i => i.Name === "Amount").Value;
//     //   const phone = metadata.find(i => i.Name === "PhoneNumber").Value;
//     //   const mpesaCode = metadata.find(i => i.Name === "MpesaReceiptNumber").Value;

//     //   // 🔥 MATCH EXACT PAYMENT
//     //   const payments = await databases.listDocuments(
//     //     "6951372e001aa540c529",
//     //     "payments_table",
//     //     [sdk.Query.equal("checkoutRequestId", checkoutId)]
//     //   );

//     //   if (payments.documents.length > 0) {
//     //     await databases.updateDocument(
//     //       "6951372e001aa540c529",
//     //       "payments_table",
//     //       payments.documents[0].$id,
//     //       {
//     //         status: "paid",
//     //         mpesaCode,
//     //         amount,
//     //       }
//     //     );
//     //     console.log("✅ Payment marked as PAID");
//     //   } else {
//     //     console.log("⚠️ No matching payment found");
//     //   }
//     // }



//     if (String(callback.ResultCode) === "0") {
//   const checkoutId = callback.CheckoutRequestID;
//   const metadata = callback.CallbackMetadata.Item;

//   const amount = metadata.find(i => i.Name === "Amount").Value;
//   const phone = metadata.find(i => i.Name === "PhoneNumber").Value;
//   const mpesaCode = metadata.find(i => i.Name === "MpesaReceiptNumber").Value;

//   const payments = await databases.listDocuments(
//     "6951372e001aa540c529",
//     "payments_table",
//     [sdk.Query.equal("checkoutRequestId", checkoutId)]
//   );

//   if (payments.documents.length > 0) {
//     await databases.updateDocument(
//       "6951372e001aa540c529",
//       "payments_table",
//       payments.documents[0].$id,
//       {
//         status: "paid",
//         mpesaCode,
//         amount,
//       }
//     );
//     console.log("✅ Payment marked as PAID");
//   } else {
//     console.log("⚠️ No matching payment found");
//   }
// }


//     // res.status(200).send("OK");
//     res.status(200).json({ success: true });

//   } catch (err) {
//     console.error("Callback error:", err.message);
//     res.status(200).send("OK");
//   }
// });


app.post("/api/callback", async (req, res) => {
  try {
    // 1️⃣ Parse the incoming callback safely
    const raw = req.body;
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;

    const callback = data.Body?.stkCallback;
    if (!callback) {
      console.log("No stkCallback found in request body");
      return res.status(200).json({ success: true });
    }

    console.log("Callback received:", callback);

    // 2️⃣ Only process successful payments
    if (String(callback.ResultCode) === "0") {
      const checkoutId = callback.CheckoutRequestID;
      const metadata = callback.CallbackMetadata.Item;

      const amount = metadata.find(i => i.Name === "Amount")?.Value;
      const phone = metadata.find(i => i.Name === "PhoneNumber")?.Value;
      const mpesaCode = metadata.find(i => i.Name === "MpesaReceiptNumber")?.Value;

      console.log("Processing payment:", { checkoutId, amount, phone, mpesaCode });

      // 3️⃣ Find the matching payment document in Appwrite
      const payments = await databases.listDocuments(
        "6951372e001aa540c529",
        "payments_table",
        [sdk.Query.equal("checkoutRequestId", checkoutId)]
      );

      if (payments.documents.length > 0) {
        // 4️⃣ Update the payment status
        await databases.updateDocument(
          "6951372e001aa540c529",
          "payments_table",
          payments.documents[0].$id,
          {
            status: "paid",
            mpesaCode,
            amount,
          }
        );
        console.log("✅ Payment marked as PAID");
      } else {
        console.log("⚠️ No matching payment found for checkoutId:", checkoutId);
      }
    } else {
      console.log("Payment failed or cancelled. ResultCode:", callback.ResultCode);
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("Callback error:", err.message);
    res.status(500).json({ error: "Callback processing failed" });
  }
});


// ============================
// 🟢 WHATSAPP WEBHOOK
// ============================

// Meta webhook verification
app.get("/webhook/whatsapp", (req, res) => {
  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ WhatsApp webhook verified");
    return res.status(200).send(challenge);
  }

  console.log("❌ WhatsApp webhook verification failed");
  res.sendStatus(403);
});

// Receive WhatsApp messages
app.post("/webhook/whatsapp", (req, res) => {
  try {
    console.log("📩 WhatsApp webhook received:");
    console.log(JSON.stringify(req.body, null, 2));

    res.sendStatus(200);
  } catch (error) {
    console.error("WhatsApp webhook error:", error);
    res.sendStatus(500);
  }
});


app.listen(5000, () => console.log("🚀 Server running"));




// const express = require("express");
// const axios = require("axios");
// const bodyParser = require("body-parser");
// const cors = require("cors");
// require("dotenv").config();

// const sdk = require("node-appwrite");

// // -------------------
// // Appwrite client
// // -------------------
// const client = new sdk.Client()
//   .setEndpoint("https://fra.cloud.appwrite.io/v1") // change if self-hosted
//   .setProject("68b1ea9c002ba37511e6")
//   .setKey(
//     "standard_8b94edc4d10099d632b03e499511eef0dcd838fc0339650e77a2a4502d916112b32c57028f80e84295dcfcb14e0a685b1e72f002a2e05798d1271b99fcd56b73578885e63e2a4f75c3efe01426e6dcb0877d1c8b815db8c14eaa67a278256fa00d0113318d4475e50c0c8921d9ef72715e7adf4809ac1c4fe76a9c29a8b11a15"
//   );

// const databases = new sdk.Databases(client);

// // -------------------
// // Express setup
// // -------------------
// const app = express();
// const PORT = 5000;

// // Middleware
// app.use(cors());
// app.use(express.json()); // JSON parser for /api/pay and others
// app.use("/api/callback", bodyParser.text({ type: "*/*" })); // raw parser for Daraja callback

// // -------------------
// // Test route
// // -------------------
// app.get("/", (req, res) => {
//   res.send("M-Pesa backend running...");
// });

// // -------------------
// // Function to get Daraja OAuth token
// // -------------------
// async function getToken() {
//   const creds = Buffer.from(
//     `${process.env.CONSUMER_KEY}:${process.env.CONSUMER_SECRET}`
//   ).toString("base64");

//   const response = await axios.get(
//     "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
//     { headers: { Authorization: `Basic ${creds}` } }
//   );

//   return response.data.access_token;
// }

// // -------------------
// // STK Push route
// // -------------------
// app.post("/api/pay", async (req, res) => {
//   try {
//     let { phone, amount, memberId, contributionId } = req.body;

//     // Validate phone format: must start with 07 or 01
//     if (!phone.startsWith("07") && !phone.startsWith("01")) {
//       return res.status(400).json({ error: "Invalid phone number" });
//     }

//     // Convert to E.164 format for Daraja
//     // if (phone.startsWith("0")) {
//     //   phone = "254" + phone.slice(1);
//     // }

//     let phoneFormatted = phone;
// if (phoneFormatted.startsWith("0")) {
//   phoneFormatted = "254" + phoneFormatted.slice(1);
// }


//     // 1️⃣ Create pending payment in Appwrite
//     const pendingPayment = await databases.createDocument(
//       "6951372e001aa540c529", // your DB
//       "payments_table",
//       sdk.ID.unique(),
//       {
//         memberId,
//         contributionId,
//         mpesaNumber: phoneFormatted,
//         amount,
//         status: "pending", // will update after callback
//       }
//     );

//     // 2️⃣ Generate STK push
//     const token = await getToken();
//     // const timestamp = new Date().toISOString().replace(/[-:TZ]/g, "").slice(0, 14);

//     function getTimestamp() {
//   const date = new Date();

//   const YYYY = date.getFullYear();
//   const MM = String(date.getMonth() + 1).padStart(2, "0");
//   const DD = String(date.getDate()).padStart(2, "0");
//   const HH = String(date.getHours()).padStart(2, "0");
//   const mm = String(date.getMinutes()).padStart(2, "0");
//   const SS = String(date.getSeconds()).padStart(2, "0");

//   return `${YYYY}${MM}${DD}${HH}${mm}${SS}`;
// }

// const timestamp = getTimestamp();

//     const password = Buffer.from(process.env.SHORTCODE + process.env.PASSKEY + timestamp).toString("base64");

//     // const stkPayload = {
//     //   BusinessShortCode: process.env.SHORTCODE,
//     //   Password: password,
//     //   Timestamp: timestamp,
//     //   TransactionType: "CustomerPayBillOnline",
//     //   Amount: amount,
//     //   PartyA: phoneFormatted,
//     //   PhoneNumber: phoneFormatted,
//     //   PartyB: process.env.SHORTCODE,
//     //   CallBackURL: `${process.env.PUBLIC_URL}/api/callback`,
//     //   AccountReference: contributionId || "Test123",
//     //   TransactionDesc: "Contribution payment",
//     // };

//    const stkPayload = {
//   BusinessShortCode: process.env.SHORTCODE,
//   Password: password,
//   Timestamp: timestamp,
//   TransactionType: "CustomerPayBillOnline",
//   Amount: amount,
//   PartyA: phoneFormatted,
//   PartyB: process.env.SHORTCODE,
//   PhoneNumber: phoneFormatted,
//   CallBackURL: `${process.env.PUBLIC_URL}/api/callback`,
//   AccountReference: contributionId || "Test123",
//   TransactionDesc: "Contribution payment",
// };



//     const { data } = await axios.post(
//       "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
//       stkPayload,
//       { headers: { Authorization: `Bearer ${token}` } }
//     );

//     res.json(data); // send Daraja response back
//   } catch (err) {
//     console.error(err.response?.data || err.message);
//     res.status(500).json({ error: "STK Push failed" });
//   }
// });

// // -------------------
// // Callback route (Daraja calls this after STK push)
// // -------------------
// app.post("/api/callback", async (req, res) => {
//   try {
//     let raw = "";
//     req.on("data", (chunk) => (raw += chunk));
//     req.on("end", async () => {
//       let data;
//       try {
//         data = JSON.parse(raw);
//       } catch (err) {
//         console.error("❌ Failed to parse callback JSON:", raw);
//         return res.status(200).send("OK"); // respond so Daraja stops retrying
//       }

//       const callback = data.Body?.stkCallback;
//       if (!callback) {
//         console.log("❌ No stkCallback found in callback JSON");
//         return res.status(200).send("OK");
//       }

//       console.log("Daraja callback:", JSON.stringify(callback, null, 2));

//       // Only handle successful payments
//       if (callback.ResultCode === 0) {
//         const metadata = callback.CallbackMetadata.Item;
//         const amount = metadata.find((i) => i.Name === "Amount").Value;
//         const phone = metadata.find((i) => i.Name === "PhoneNumber").Value;
//         const mpesaCode = metadata.find((i) => i.Name === "MpesaReceiptNumber").Value;

//         // Update the pending payment in Appwrite
//         // Search for pending payment by phone and contributionId
//         const payments = await databases.listDocuments(
//           "6951372e001aa540c529",
//           "payments_table",
//           [
//             sdk.Query.equal("mpesaNumber", phone),
//             sdk.Query.equal("status", "pending")
//           ]
//         );

//         if (payments.documents.length > 0) {
//           const paymentId = payments.documents[0].$id;
//           await databases.updateDocument(
//             "6951372e001aa540c529",
//             "payments_table",
//             paymentId,
//             {
//               status: "paid",
//               mpesaCode,
//               amount
//             }
//           );
//           console.log("✅ Payment updated to Appwrite as paid");
//         } else {
//           console.log("⚠️ No pending payment found for this callback, creating new one");
//           await databases.createDocument(
//             "6951372e001aa540c529",
//             "payments_table",
//             sdk.ID.unique(),
//             {
//               mpesaNumber: phone,
//               amount,
//               mpesaCode,
//               status: "paid"
//             }
//           );
//         }
//       } else {
//         console.log("❌ Payment failed or cancelled");
//       }

//       res.status(200).send("OK");
//     });
//   } catch (err) {
//     console.error("Callback error:", err);
//     res.status(200).send("Error handled");
//   }
// });

// // app.post("/api/callback", bodyParser.json({ type: "*/*" }), async (req, res) => {
// //   try {
// //     const callback = req.body.Body.stkCallback;
// //     console.log("Daraja callback:", JSON.stringify(callback, null, 2));

// //     if (callback.ResultCode === 0) {
// //       const metadata = callback.CallbackMetadata.Item;
// //       const amount = metadata.find(i => i.Name === "Amount").Value;
// //       const phone = metadata.find(i => i.Name === "PhoneNumber").Value;
// //       const mpesaCode = metadata.find(i => i.Name === "MpesaReceiptNumber").Value;

// //       // ✅ Find the pending payment for this phone & contribution
// //       const payments = await databases.listDocuments(
// //         DATABASE_ID,
// //         PAYMENTS_COLLECTION_ID,
// //         [
// //           sdk.Query.equal("mpesaNumber", phone),
// //           sdk.Query.equal("status", "pending")
// //         ]
// //       );

// //       if (payments.documents.length > 0) {
// //         const paymentId = payments.documents[0].$id;

// //         await databases.updateDocument(
// //           DATABASE_ID,
// //           PAYMENTS_COLLECTION_ID,
// //           paymentId,
// //           {
// //             status: "paid",
// //             mpesaCode,
// //             amount // optional: update amount in case it changed
// //           }
// //         );

// //         console.log("✅ Payment updated to paid in Appwrite");
// //       } else {
// //         console.log("⚠️ No pending payment found for this phone");
// //       }
// //     } else {
// //       console.log("❌ Payment failed or cancelled");
// //     }

// //     res.status(200).send("OK");
// //   } catch (err) {
// //     console.error("Callback error:", err);
// //     res.status(200).send("Error handled");
// //   }
// // });


// // -------------------
// // Start server
// // -------------------
// app.listen(PORT, () => console.log(`Server running on port ${PORT}`));




