import type { Notice } from "../types";

/**
 * Privacy Notice — DPDP Act 2023 s.5 + DPDP Rules 2025 (notice contents), plain language.
 * DRAFT: must be reviewed by a lawyer before launch. `{{…}}` tokens are filled from lib/legal/config.ts.
 * Processors marked "to be confirmed" are listed by category until the owner picks each provider (PRD §9).
 */
export const PRIVACY_NOTICE: Notice = {
  slug: "privacy",
  version: "2026-12-01",
  lastUpdated: "2026-12-01",
  text: {
    en: {
      title: "Privacy Notice",
      summary:
        "What personal data {{storeName}} collects, why, who it is shared with, how long we keep it, and how you can use your rights under the Digital Personal Data Protection Act, 2023.",
      sections: [
        {
          id: "who-we-are",
          heading: "1. Who we are",
          blocks: [
            {
              type: "p",
              text: "{{storeName}} is operated by {{entityName}}, {{registeredAddress}} (\"we\", \"us\"). For your personal data we are the Data Fiduciary under the Digital Personal Data Protection Act, 2023 (\"DPDP Act\").",
            },
            {
              type: "p",
              text: "Questions about this notice: {{privacyEmail}}. Grievance Officer: {{grievanceName}}, {{grievanceDesignation}} — {{grievanceEmail}}, {{grievancePhone}}.",
            },
          ],
        },
        {
          id: "data-and-purposes",
          heading: "2. The personal data we use and why",
          blocks: [
            {
              type: "p",
              text: "We only use each item of data for the purpose shown next to it. Optional purposes are off until you switch them on, and you can switch them off at any time.",
            },
            {
              type: "table",
              head: ["Personal data", "Purpose", "Basis"],
              rows: [
                ["Mobile number (verified by OTP), name, email (optional)", "Create and secure your account, sign you in, place and update orders", "Your consent when you sign up or check out"],
                ["Delivery addresses: receiver's name and mobile (yours or someone you order for), alternate mobile, address, pincode, delivery instructions and, if you place one, a map pin", "Deliver orders, help the courier find the door, check serviceability, delivery dates and Cash on Delivery eligibility. If you save an address for someone else, please tell them", "Your consent when you save an address or check out"],
                ["Your location — only when you tap “Use my current location” or place a pin on the map", "Suggest the address fields and pin the delivery spot. Your browser asks you first; we never track your location", "Your consent (the browser prompt and your tap)"],
                ["Product reviews you write (rating, title, text, fit, size bought) and up to 3 photos you add", "Shown on the product page after a check, with your first name and last initial and a “Verified buyer” badge. Photos stay private (only you and our moderators see them) until the review is approved; location and camera details are removed when you upload. We may post a public reply under your review and email you when it is published, not published (with the reason) or replied to. You can edit or delete a review any time — its public copy and photos come off the page straight away", "Your consent when you submit a review"],
                ["Messages you send us (Help & feedback) and our replies", "Answer your question (our team replies in your account and emails you that a reply is waiting) and improve the store", "Our legitimate use: answering you"],
                ["Order details: items, sizes, amounts, coupons, payment status and payment reference", "Fulfil orders, issue GST invoices, handle cancellations, returns and refunds", "Your consent; and keeping records required by tax and consumer law"],
                ["Order, return and delivery history; address quality signals", "Prevent fraud and Cash on Delivery misuse (for example, limiting COD for repeated refused deliveries)", "Your consent when you check out; preventing fraud"],
                ["Return and exchange requests, including photos you upload", "Assess and complete returns and exchanges", "Your consent when you raise the request"],
                ["UPI ID you give for a cash-on-delivery refund", "Send that refund to you", "Your consent when you choose a UPI refund"],
                ["Store credit balance and history", "Give and track store credit from returns", "Your consent when you choose store credit"],
                ["Alpha Club membership (optional): tier, 12-month spend, Hood Coins history, referral code and who joined with it", "Give you coins, tier perks and referral rewards; stop referral abuse (we compare phone, delivery address and a random browser id between referrer and friend)", "Optional consent when you join — leave any time"],
                ["#WearTheHood photo, caption and first name (optional)", "Review it and, once approved, show it on our website", "Optional consent per photo — remove any time"],
                ["Product alerts you set (product, size, price at the time)", "Tell you when a size is back or the price drops", "Your request when you set the alert"],
                ["Gift cards, store credit and Hood Coins used to pay (amounts, which order; gift card codes are stored only in a scrambled, one-way form)", "Take payment, refund to the right place, keep accounts and stop misuse", "Your consent when you pay; and keeping records required by tax law"],
                ["Order updates on WhatsApp (optional)", "Send order, delivery and alert messages on WhatsApp too", "Optional consent — off by default"],
                ["Size advice", "Suggest a size from the sizes you kept and returned before (no new data is collected)", "Necessary to provide the feature you use, shown only to you"],
                ["Messages to support, privacy requests and grievances", "Answer you and keep a record of how we handled it", "Your consent; and legal obligations"],
                ["Email, WhatsApp number or mobile number (SMS) for offers (optional) — a separate choice for each", "Send you offers and new drops on the channel you chose", "Optional consent — off by default"],
                ["IP address, browser/device type, a random visitor ID cookie", "Keep the site secure, stop abuse, and keep proof of your consent choices", "Necessary to provide a secure service and to prove consent"],
                ["Analytics data (optional): pages and products viewed, search terms, bag, checkout and order events (items, sizes, value, order number), a cookie ID, device and browser type", "Measure and improve the store (Google Analytics)", "Optional consent (Analytics cookies) — off by default"],
                ["Advertising data (optional): the same shopping events, ad-click and cookie IDs, IP address, browser type, and for purchases your mobile number in hashed (one-way encoded) form", "Measure which of our ads work and show you relevant ads on other sites (Google Ads, Meta)", "Optional consent (Advertising cookies) — off by default"],
              ],
            },
            {
              type: "p",
              text: "We never receive or store your full card number, CVV or UPI PIN — payments are handled by our payment gateway.",
            },
          ],
        },
        {
          id: "sharing",
          heading: "3. Who we share it with",
          blocks: [
            {
              type: "p",
              text: "We share only what each service provider (Data Processor) needs for the stated purpose, under a contract that requires them to protect it. We do not sell your personal data.",
            },
            {
              type: "table",
              head: ["Who", "What for", "Provider"],
              rows: [
                ["E-commerce platform and hosting", "Run the store, your account, cart and orders", "To be confirmed before launch"],
                ["Payment gateway", "Take payments and refunds (UPI, cards, netbanking, wallets). We send only the order number and amount; you enter payment details on the gateway's own page", "Razorpay Software Private Limited, India (when online payment is switched on)"],
                ["Courier and logistics partners", "Deliver orders, pick up returns, show tracking", "To be confirmed before launch"],
                ["SMS, email and WhatsApp providers", "OTPs and order updates; offers only if you opted in", "To be confirmed before launch"],
                ["Error monitoring", "Find and fix technical faults: the error text, the page path and the release. No payment data, cookies, IP addresses or phone numbers", "Sentry (used once switched on)"],
                ["Bot protection", "Confirm that a request for a sign-in code comes from a person, not a script. The provider sees your IP address and browser details", "Cloudflare Turnstile (used once switched on)"],
                ["Google sign-in", "Only if you choose \"Continue with Google\": we receive your Google account ID, name and verified email to sign you in. You can unlink it in Account → Settings", "Google LLC (used once switched on)"],
                ["Facebook sign-in", "Only if you choose \"Continue with Facebook\": we receive your Facebook account ID and name to sign you in. You can unlink it in Account → Settings", "Meta Platforms Ireland Ltd (used once switched on)"],
                ["Maps (OpenStreetMap / MapTiler)", "Show the map in the address form. Your browser loads map images from them (they see your IP address); only when you open the map", "OpenStreetMap Foundation; MapTiler AG (if switched on)"],
                ["Address suggestions (OpenStreetMap Nominatim / Google Geocoding)", "Turn a map pin into area, city, state and pincode. Sent from our server with only the pin — never your name, phone or IP address", "OpenStreetMap Foundation; Google LLC (if switched on)"],
                ["Google Analytics 4", "Site analytics — only if you accept Analytics cookies", "Google LLC (used once switched on; listed in the Cookie Policy as \"In use\")"],
                ["Google Ads", "Ad measurement — only if you accept Advertising cookies", "Google LLC (used once switched on)"],
                ["Meta Pixel and Conversions API", "Ad measurement and audiences on Facebook and Instagram — only if you accept Advertising cookies", "Meta Platforms Ireland Ltd (used once switched on)"],
              ],
            },
            {
              type: "p",
              text: "We may also disclose data when the law requires it (for example, to a court, tax or law-enforcement authority) or to protect our users against fraud.",
            },
            {
              type: "p",
              text: "This list will name each provider before we start using it, and this notice will be updated.",
            },
          ],
        },
        {
          id: "transfers",
          heading: "4. Transfers outside India",
          blocks: [
            {
              type: "p",
              text: "Some providers may store or process data outside India — for example, Google and Meta process analytics and advertising data in the United States and other countries, only if you accept those cookies. We will not transfer personal data to any country or territory that the Central Government has restricted under section 16 of the DPDP Act.",
            },
          ],
        },
        {
          id: "retention",
          heading: "5. How long we keep it",
          blocks: [
            {
              type: "table",
              head: ["Data", "How long"],
              rows: [
                ["Account profile and saved addresses", "While your account is active. Deleted within 30 days of you deleting your account, except the records below. If an account is unused for 3 years we will tell you 48 hours before deleting it."],
                ["Orders, invoices and payment references", "As long as tax and accounting law requires (GST records: at least 72 months from the due date of the annual return for that year)."],
                ["Return/exchange photos", "Until the return is closed, then up to 180 days for disputes."],
                ["UPI ID for a COD refund", "Until the refund is paid, then up to 180 days for disputes."],
                ["Store credit", "While your account is active; unused credit ends when you delete your account."],
                ["Alpha Club data and Hood Coins", "While you are a member; deleted when you leave or delete your account (coin entries linked to orders are kept with the order records)."],
                ["#WearTheHood photos", "Until you remove them or delete your account; rejected photos are deleted within 30 days."],
                ["Product alerts", "Until the alert is sent or you remove it; sent alerts are deleted after 90 days."],
                ["Offer subscriptions (email/WhatsApp/SMS)", "Until you unsubscribe or withdraw consent; then deleted within 30 days."],
                ["Consent records (what you agreed to, when and to which version)", "As long as needed to prove consent — up to 7 years after you withdraw or close your account."],
                ["Privacy requests and grievances", "3 years after the request is closed."],
                ["Security and access logs", "At least 1 year, as the DPDP Rules require, then deleted."],
                ["Visitor ID and consent cookies", "12 months and 6 months respectively (see the Cookie Policy)."],
                ["Analytics and advertising data", "Google Analytics keeps event data for 14 months. Google Ads and Meta keep it under their own terms. Withdrawing consent stops new data at once; past data can be deleted on request."],
              ],
            },
          ],
        },
        {
          id: "rights",
          heading: "6. Your rights",
          blocks: [
            {
              type: "list",
              items: [
                "Access: a summary of your personal data, what we use it for, and who we shared it with.",
                "Correction, completion and updating of inaccurate or incomplete data.",
                "Erasure of data we no longer need or for which you withdraw consent (except records the law makes us keep, listed above).",
                "Withdraw consent at any time — as easily as you gave it. Withdrawal does not affect processing already done.",
                "Nominate another person to exercise your rights if you die or become unable to.",
                "Grievance redressal — a reply from our Grievance Officer.",
              ],
            },
            {
              type: "p",
              text: "Use the privacy request form at /privacy/request or write to {{privacyEmail}}. It is free. To protect you, we confirm your identity (usually with a one-time code to the mobile number or email on the account) before acting.",
            },
            {
              type: "p",
              text: "If you withdraw consent needed to run your account or deliver an order, we may not be able to provide that service; we will tell you first.",
            },
          ],
        },
        {
          id: "consent",
          heading: "7. Managing your consent",
          blocks: [
            {
              type: "list",
              items: [
                "\"Your consents\" (/privacy/consents) shows your current choices and their history, and lets you switch optional purposes off.",
                "\"Cookie preferences\" in the footer of every page reopens the cookie choices.",
                "Every offer message has an unsubscribe option.",
              ],
            },
            {
              type: "p",
              text: "We keep a record of each choice (purpose, yes/no, date and time, the notice version, and the page or app it came from) so we can prove what you agreed to.",
            },
          ],
        },
        {
          id: "grievance",
          heading: "8. Grievances and the Data Protection Board",
          blocks: [
            {
              type: "p",
              text: "Grievance Officer: {{grievanceName}}, {{grievanceDesignation}}, {{entityName}}, {{registeredAddress}}. Email {{grievanceEmail}} · Phone {{grievancePhone}}.",
            },
            {
              type: "p",
              text: "We acknowledge every grievance within {{ackHours}} hours and aim to resolve it within {{resolveDays}} days.",
            },
            {
              type: "p",
              text: "If you are not satisfied with our response, you may complain to the Data Protection Board of India once you have used our grievance process.",
            },
          ],
        },
        {
          id: "children",
          heading: "9. Children",
          blocks: [
            {
              type: "p",
              text: "The store is for adults aged 18 and over. We do not knowingly collect personal data from anyone under 18 without verifiable consent from a parent or lawful guardian, and we do not track, behaviourally monitor or target ads at children. If you believe a child has given us personal data, contact {{privacyEmail}} and we will delete it.",
            },
          ],
        },
        {
          id: "security",
          heading: "10. Security and breaches",
          blocks: [
            {
              type: "p",
              text: "We use reasonable security safeguards: encrypted connections (HTTPS), access only for staff who need it, multi-factor sign-in for staff, encrypted secrets, and logs of access to personal data.",
            },
            {
              type: "p",
              text: "If a personal data breach affects you, we will tell you and the Data Protection Board of India without delay, as the DPDP Rules require — what happened, the likely impact, what we are doing, and what you can do.",
            },
          ],
        },
        {
          id: "cookies",
          heading: "11. Cookies",
          blocks: [
            {
              type: "p",
              text: "We use only strictly necessary cookies unless you accept optional ones. The Cookie Policy (/legal/cookies) lists every cookie, its purpose and lifetime.",
            },
          ],
        },
        {
          id: "changes",
          heading: "12. Changes to this notice",
          blocks: [
            {
              type: "p",
              text: "Each version has a date at the top. If we make a material change, we will tell you on the site (and by email or SMS if you have an account) and ask for fresh consent where the law requires it.",
            },
            {
              type: "p",
              text: "This notice is also available in Hindi.",
            },
          ],
        },
      ],
    },
    hi: {
      title: "गोपनीयता सूचना",
      summary:
        "{{storeName}} कौन-सा व्यक्तिगत डेटा लेता है, क्यों, किसके साथ साझा करता है, कितने समय तक रखता है, और डिजिटल व्यक्तिगत डेटा संरक्षण अधिनियम, 2023 के तहत आप अपने अधिकारों का उपयोग कैसे कर सकते हैं।",
      sections: [
        {
          id: "who-we-are",
          heading: "1. हम कौन हैं",
          blocks: [
            {
              type: "p",
              text: "{{storeName}} का संचालन {{entityName}}, {{registeredAddress}} (\"हम\") द्वारा किया जाता है। आपके व्यक्तिगत डेटा के लिए हम डिजिटल व्यक्तिगत डेटा संरक्षण अधिनियम, 2023 (\"DPDP अधिनियम\") के तहत डेटा फिड्यूशियरी हैं।",
            },
            {
              type: "p",
              text: "इस सूचना से जुड़े प्रश्न: {{privacyEmail}}। शिकायत अधिकारी: {{grievanceName}}, {{grievanceDesignation}} — {{grievanceEmail}}, {{grievancePhone}}।",
            },
          ],
        },
        {
          id: "data-and-purposes",
          heading: "2. हम कौन-सा व्यक्तिगत डेटा लेते हैं और क्यों",
          blocks: [
            {
              type: "p",
              text: "हम हर डेटा का उपयोग केवल उसके सामने लिखे उद्देश्य के लिए करते हैं। वैकल्पिक उद्देश्य तब तक बंद रहते हैं जब तक आप उन्हें चालू न करें, और आप उन्हें कभी भी बंद कर सकते हैं।",
            },
            {
              type: "table",
              head: ["व्यक्तिगत डेटा", "उद्देश्य", "आधार"],
              rows: [
                ["मोबाइल नंबर (OTP से सत्यापित), नाम, ईमेल (वैकल्पिक)", "आपका खाता बनाना और सुरक्षित रखना, साइन-इन, ऑर्डर देना और अपडेट भेजना", "साइन-अप या चेकआउट के समय आपकी सहमति"],
                ["डिलीवरी पते: पाने वाले का नाम और मोबाइल (आपका या जिसके लिए आप ऑर्डर करते हैं), दूसरा मोबाइल, पता, पिनकोड, डिलीवरी निर्देश और, अगर आप लगाएँ, मैप पिन", "ऑर्डर पहुँचाना, कूरियर को दरवाज़ा ढूँढने में मदद, सेवा-क्षेत्र, डिलीवरी की तारीख और कैश ऑन डिलीवरी की पात्रता जाँचना। किसी और का पता सहेजें तो कृपया उन्हें बताएँ", "पता सहेजते या चेकआउट करते समय आपकी सहमति"],
                ["आपकी लोकेशन — केवल तब जब आप “मेरी मौजूदा लोकेशन” दबाएँ या मैप पर पिन लगाएँ", "पते के खाने सुझाना और डिलीवरी की जगह पिन करना। पहले आपका ब्राउज़र पूछता है; हम आपकी लोकेशन कभी ट्रैक नहीं करते", "आपकी सहमति (ब्राउज़र की अनुमति और आपका टैप)"],
                ["आपके लिखे प्रोडक्ट रिव्यू (रेटिंग, शीर्षक, टेक्स्ट, फ़िट, खरीदा गया साइज़) और आपकी जोड़ी गई अधिकतम 3 फ़ोटो", "जाँच के बाद प्रोडक्ट पेज पर, आपके पहले नाम और उपनाम के पहले अक्षर और “Verified buyer” के साथ दिखाए जाते हैं। रिव्यू स्वीकृत होने तक फ़ोटो निजी रहती हैं (केवल आप और हमारे मॉडरेटर देख सकते हैं); अपलोड करते समय लोकेशन और कैमरे की जानकारी हटा दी जाती है। हम आपके रिव्यू के नीचे सार्वजनिक जवाब दे सकते हैं और रिव्यू प्रकाशित होने, प्रकाशित न होने (कारण सहित) या जवाब मिलने पर आपको ईमेल करते हैं। आप रिव्यू कभी भी बदल या हटा सकते हैं — उसकी सार्वजनिक कॉपी और फ़ोटो तुरंत पेज से हट जाती हैं", "रिव्यू भेजते समय आपकी सहमति"],
                ["आपके भेजे संदेश (मदद और फ़ीडबैक) और हमारे जवाब", "आपके सवाल का जवाब देना (हमारी टीम आपके खाते में जवाब देती है और ईमेल से बताती है कि जवाब आ गया है) और स्टोर बेहतर बनाना", "हमारा वैध उपयोग: आपको जवाब देना"],
                ["ऑर्डर का विवरण: सामान, साइज़, राशि, कूपन, भुगतान की स्थिति और भुगतान संदर्भ", "ऑर्डर पूरा करना, GST चालान देना, रद्दीकरण, रिटर्न और रिफ़ंड", "आपकी सहमति; और कर व उपभोक्ता कानून के तहत आवश्यक रिकॉर्ड"],
                ["ऑर्डर, रिटर्न और डिलीवरी का इतिहास; पते की गुणवत्ता के संकेत", "धोखाधड़ी और कैश ऑन डिलीवरी के दुरुपयोग को रोकना", "चेकआउट के समय आपकी सहमति; धोखाधड़ी की रोकथाम"],
                ["रिटर्न/एक्सचेंज अनुरोध, आपके द्वारा अपलोड की गई तस्वीरों सहित", "रिटर्न और एक्सचेंज की जाँच और उन्हें पूरा करना", "अनुरोध करते समय आपकी सहमति"],
                ["कैश ऑन डिलीवरी रिफ़ंड के लिए आपके द्वारा दी गई UPI ID", "वह रिफ़ंड आपको भेजना", "UPI रिफ़ंड चुनते समय आपकी सहमति"],
                ["स्टोर क्रेडिट बैलेंस और इतिहास", "रिटर्न से स्टोर क्रेडिट देना और उसका हिसाब रखना", "स्टोर क्रेडिट चुनते समय आपकी सहमति"],
                ["Alpha Club सदस्यता (वैकल्पिक): टियर, 12 महीने का खर्च, Hood Coins का इतिहास, रेफ़रल कोड और उससे जुड़ने वाले लोग", "आपको कॉइन, टियर के लाभ और रेफ़रल इनाम देना; रेफ़रल के दुरुपयोग को रोकना (रेफ़र करने वाले और दोस्त के फ़ोन, डिलीवरी पते और एक रैंडम ब्राउज़र ID की तुलना)", "जुड़ते समय वैकल्पिक सहमति — कभी भी छोड़ सकते हैं"],
                ["#WearTheHood फ़ोटो, कैप्शन और पहला नाम (वैकल्पिक)", "समीक्षा करना और स्वीकृत होने पर हमारी वेबसाइट पर दिखाना", "हर फ़ोटो के लिए वैकल्पिक सहमति — कभी भी हटा सकते हैं"],
                ["आपके द्वारा सेट किए गए प्रोडक्ट अलर्ट (प्रोडक्ट, साइज़, उस समय की कीमत)", "साइज़ वापस आने या कीमत घटने पर आपको बताना", "अलर्ट सेट करते समय आपका अनुरोध"],
                ["भुगतान में उपयोग किए गए गिफ़्ट कार्ड, स्टोर क्रेडिट और Hood Coins (राशि, कौन-सा ऑर्डर; गिफ़्ट कार्ड कोड केवल एकतरफ़ा कूटबद्ध रूप में रखे जाते हैं)", "भुगतान लेना, सही जगह रिफ़ंड करना, हिसाब रखना और दुरुपयोग रोकना", "भुगतान करते समय आपकी सहमति; और कर कानून के तहत आवश्यक रिकॉर्ड"],
                ["WhatsApp पर ऑर्डर अपडेट (वैकल्पिक)", "ऑर्डर, डिलीवरी और अलर्ट संदेश WhatsApp पर भी भेजना", "वैकल्पिक सहमति — शुरुआत में बंद"],
                ["साइज़ सलाह", "आपके पहले रखे और लौटाए गए साइज़ से साइज़ सुझाना (कोई नया डेटा नहीं लिया जाता)", "आपके द्वारा उपयोग की गई सुविधा के लिए आवश्यक, केवल आपको दिखता है"],
                ["सहायता संदेश, गोपनीयता अनुरोध और शिकायतें", "आपको उत्तर देना और उसका रिकॉर्ड रखना", "आपकी सहमति; और कानूनी दायित्व"],
                ["ऑफ़र के लिए ईमेल, WhatsApp नंबर या मोबाइल नंबर (SMS) (वैकल्पिक) — हर एक के लिए अलग विकल्प", "आपके चुने हुए माध्यम पर ऑफ़र और नए ड्रॉप की जानकारी भेजना", "वैकल्पिक सहमति — शुरुआत में बंद"],
                ["IP पता, ब्राउज़र/डिवाइस का प्रकार, एक रैंडम विज़िटर ID कुकी", "साइट को सुरक्षित रखना, दुरुपयोग रोकना और आपकी सहमति का प्रमाण रखना", "सुरक्षित सेवा देने और सहमति प्रमाणित करने के लिए आवश्यक"],
                ["एनालिटिक्स डेटा (वैकल्पिक): देखे गए पेज और उत्पाद, खोज शब्द, बैग, चेकआउट और ऑर्डर की घटनाएँ (सामान, साइज़, राशि, ऑर्डर नंबर), एक कुकी ID, डिवाइस और ब्राउज़र का प्रकार", "स्टोर को मापना और बेहतर बनाना (Google Analytics)", "वैकल्पिक सहमति (एनालिटिक्स कुकीज़) — शुरुआत में बंद"],
                ["विज्ञापन डेटा (वैकल्पिक): वही खरीदारी घटनाएँ, विज्ञापन-क्लिक और कुकी ID, IP पता, ब्राउज़र का प्रकार, और खरीदारी पर आपका मोबाइल नंबर हैश (एकतरफ़ा कूटबद्ध) रूप में", "हमारे कौन-से विज्ञापन काम करते हैं यह मापना और अन्य साइटों पर प्रासंगिक विज्ञापन दिखाना (Google Ads, Meta)", "वैकल्पिक सहमति (विज्ञापन कुकीज़) — शुरुआत में बंद"],
              ],
            },
            {
              type: "p",
              text: "हम आपका पूरा कार्ड नंबर, CVV या UPI PIN कभी प्राप्त या संग्रहीत नहीं करते — भुगतान हमारे पेमेंट गेटवे द्वारा संभाला जाता है।",
            },
          ],
        },
        {
          id: "sharing",
          heading: "3. हम डेटा किसके साथ साझा करते हैं",
          blocks: [
            {
              type: "p",
              text: "हम हर सेवा प्रदाता (डेटा प्रोसेसर) के साथ केवल उतना ही डेटा साझा करते हैं जितना बताए गए उद्देश्य के लिए आवश्यक है, एक अनुबंध के तहत जो उन्हें इसकी सुरक्षा के लिए बाध्य करता है। हम आपका व्यक्तिगत डेटा नहीं बेचते।",
            },
            {
              type: "table",
              head: ["कौन", "किसलिए", "प्रदाता"],
              rows: [
                ["ई-कॉमर्स प्लेटफ़ॉर्म और होस्टिंग", "स्टोर, आपका खाता, कार्ट और ऑर्डर चलाना", "लॉन्च से पहले तय किया जाएगा"],
                ["पेमेंट गेटवे", "भुगतान और रिफ़ंड (UPI, कार्ड, नेटबैंकिंग, वॉलेट)। हम केवल ऑर्डर नंबर और राशि भेजते हैं; भुगतान विवरण आप गेटवे के अपने पेज पर भरते हैं", "Razorpay Software Private Limited, भारत (ऑनलाइन भुगतान चालू होने पर)"],
                ["कूरियर और लॉजिस्टिक्स साझेदार", "ऑर्डर पहुँचाना, रिटर्न उठाना, ट्रैकिंग दिखाना", "लॉन्च से पहले तय किया जाएगा"],
                ["SMS, ईमेल और WhatsApp प्रदाता", "OTP और ऑर्डर अपडेट; ऑफ़र केवल तब जब आपने सहमति दी हो", "लॉन्च से पहले तय किया जाएगा"],
                ["एरर मॉनिटरिंग", "तकनीकी खराबियाँ ढूँढना और ठीक करना: एरर का टेक्स्ट, पेज का पाथ और रिलीज़। भुगतान डेटा, कुकीज़, IP पता या फ़ोन नंबर नहीं", "Sentry (चालू होने पर उपयोग)"],
                ["बॉट से सुरक्षा", "यह पक्का करना कि साइन-इन कोड का अनुरोध किसी व्यक्ति ने किया है, स्क्रिप्ट ने नहीं। प्रदाता को आपका IP पता और ब्राउज़र की जानकारी दिखती है", "Cloudflare Turnstile (चालू होने पर उपयोग)"],
                ["Google साइन-इन", "केवल तब जब आप \"Google से जारी रखें\" चुनें: आपको साइन-इन करने के लिए हमें आपका Google खाता ID, नाम और सत्यापित ईमेल मिलता है। आप इसे खाता → सेटिंग्स में हटा सकते हैं", "Google LLC (चालू होने पर उपयोग)"],
                ["Facebook साइन-इन", "केवल तब जब आप \"Facebook से जारी रखें\" चुनें: आपको साइन-इन करने के लिए हमें आपका Facebook खाता ID और नाम मिलता है। आप इसे खाता → सेटिंग्स में हटा सकते हैं", "Meta Platforms Ireland Ltd (चालू होने पर उपयोग)"],
                ["मैप (OpenStreetMap / MapTiler)", "पते के फ़ॉर्म में मैप दिखाना। आपका ब्राउज़र उनसे मैप की तस्वीरें लेता है (उन्हें आपका IP पता दिखता है); केवल जब आप मैप खोलें", "OpenStreetMap Foundation; MapTiler AG (चालू होने पर)"],
                ["पते के सुझाव (OpenStreetMap Nominatim / Google Geocoding)", "मैप पिन से इलाका, शहर, राज्य और पिनकोड बनाना। हमारे सर्वर से केवल पिन भेजा जाता है — आपका नाम, फ़ोन या IP पता कभी नहीं", "OpenStreetMap Foundation; Google LLC (चालू होने पर)"],
                ["Google Analytics 4", "साइट एनालिटिक्स — केवल तब जब आप एनालिटिक्स कुकीज़ स्वीकार करें", "Google LLC (चालू होने पर उपयोग; कुकी नीति में \"उपयोग में\" दिखेगा)"],
                ["Google Ads", "विज्ञापन मापन — केवल तब जब आप विज्ञापन कुकीज़ स्वीकार करें", "Google LLC (चालू होने पर उपयोग)"],
                ["Meta Pixel और Conversions API", "Facebook और Instagram पर विज्ञापन मापन और ऑडियंस — केवल तब जब आप विज्ञापन कुकीज़ स्वीकार करें", "Meta Platforms Ireland Ltd (चालू होने पर उपयोग)"],
              ],
            },
            {
              type: "p",
              text: "कानून की आवश्यकता होने पर (जैसे किसी न्यायालय, कर या कानून-प्रवर्तन प्राधिकरण को) या अपने उपयोगकर्ताओं को धोखाधड़ी से बचाने के लिए भी हम डेटा प्रकट कर सकते हैं।",
            },
            {
              type: "p",
              text: "किसी प्रदाता का उपयोग शुरू करने से पहले इस सूची में उसका नाम जोड़ा जाएगा और यह सूचना अपडेट की जाएगी।",
            },
          ],
        },
        {
          id: "transfers",
          heading: "4. भारत के बाहर डेटा का स्थानांतरण",
          blocks: [
            {
              type: "p",
              text: "कुछ प्रदाता डेटा को भारत के बाहर संग्रहीत या संसाधित कर सकते हैं — उदाहरण के लिए, Google और Meta एनालिटिक्स और विज्ञापन डेटा को अमेरिका और अन्य देशों में संसाधित करते हैं, केवल तब जब आप वे कुकीज़ स्वीकार करें। हम DPDP अधिनियम की धारा 16 के तहत केंद्र सरकार द्वारा प्रतिबंधित किसी भी देश या क्षेत्र में व्यक्तिगत डेटा नहीं भेजेंगे।",
            },
          ],
        },
        {
          id: "retention",
          heading: "5. हम डेटा कितने समय तक रखते हैं",
          blocks: [
            {
              type: "table",
              head: ["डेटा", "अवधि"],
              rows: [
                ["खाता प्रोफ़ाइल और सहेजे गए पते", "जब तक आपका खाता सक्रिय है। खाता हटाने के 30 दिनों के भीतर हटा दिया जाता है, नीचे दिए गए रिकॉर्ड को छोड़कर। यदि कोई खाता 3 वर्ष तक उपयोग नहीं होता, तो हटाने से 48 घंटे पहले हम आपको सूचित करेंगे।"],
                ["ऑर्डर, चालान और भुगतान संदर्भ", "जब तक कर और लेखा कानून के अनुसार आवश्यक हो (GST रिकॉर्ड: उस वर्ष के वार्षिक रिटर्न की नियत तिथि से कम से कम 72 महीने)।"],
                ["रिटर्न/एक्सचेंज की तस्वीरें", "रिटर्न बंद होने तक, फिर विवादों के लिए अधिकतम 180 दिन।"],
                ["COD रिफ़ंड के लिए UPI ID", "रिफ़ंड का भुगतान होने तक, फिर विवादों के लिए अधिकतम 180 दिन।"],
                ["स्टोर क्रेडिट", "जब तक आपका खाता सक्रिय है; खाता हटाने पर बचा हुआ क्रेडिट समाप्त हो जाता है।"],
                ["Alpha Club डेटा और Hood Coins", "जब तक आप सदस्य हैं; छोड़ने या खाता हटाने पर हटा दिया जाता है (ऑर्डर से जुड़ी कॉइन प्रविष्टियाँ ऑर्डर रिकॉर्ड के साथ रखी जाती हैं)।"],
                ["#WearTheHood फ़ोटो", "जब तक आप उन्हें न हटाएँ या खाता न हटाएँ; अस्वीकृत फ़ोटो 30 दिनों में हटा दी जाती हैं।"],
                ["प्रोडक्ट अलर्ट", "अलर्ट भेजे जाने या आपके हटाने तक; भेजे गए अलर्ट 90 दिनों बाद हटा दिए जाते हैं।"],
                ["ऑफ़र सदस्यता (ईमेल/WhatsApp/SMS)", "जब तक आप सदस्यता समाप्त न करें या सहमति वापस न लें; फिर 30 दिनों के भीतर हटा दी जाती है।"],
                ["सहमति के रिकॉर्ड (आपने क्या, कब और किस संस्करण पर सहमति दी)", "सहमति प्रमाणित करने के लिए जितना आवश्यक हो — सहमति वापस लेने या खाता बंद करने के बाद अधिकतम 7 वर्ष।"],
                ["गोपनीयता अनुरोध और शिकायतें", "अनुरोध बंद होने के 3 वर्ष बाद तक।"],
                ["सुरक्षा और एक्सेस लॉग", "DPDP नियमों के अनुसार कम से कम 1 वर्ष, फिर हटा दिए जाते हैं।"],
                ["विज़िटर ID और सहमति कुकीज़", "क्रमशः 12 महीने और 6 महीने (कुकी नीति देखें)।"],
                ["एनालिटिक्स और विज्ञापन डेटा", "Google Analytics घटना डेटा 14 महीने तक रखता है। Google Ads और Meta इसे अपनी शर्तों के अनुसार रखते हैं। सहमति वापस लेते ही नया डेटा तुरंत रुक जाता है; पुराना डेटा अनुरोध पर हटाया जा सकता है।"],
              ],
            },
          ],
        },
        {
          id: "rights",
          heading: "6. आपके अधिकार",
          blocks: [
            {
              type: "list",
              items: [
                "पहुँच: आपके व्यक्तिगत डेटा का सारांश, हम उसका उपयोग किसलिए करते हैं, और हमने उसे किसके साथ साझा किया।",
                "गलत या अधूरे डेटा का सुधार, पूर्णता और अद्यतन।",
                "ऐसे डेटा को मिटाना जिसकी हमें अब आवश्यकता नहीं है या जिसके लिए आप सहमति वापस लेते हैं (ऊपर सूचीबद्ध उन रिकॉर्ड को छोड़कर जिन्हें कानून के तहत रखना आवश्यक है)।",
                "किसी भी समय सहमति वापस लेना — उतनी ही आसानी से जितनी आसानी से आपने दी थी। इससे पहले हो चुकी प्रक्रिया प्रभावित नहीं होती।",
                "आपकी मृत्यु या असमर्थता की स्थिति में आपके अधिकारों का उपयोग करने के लिए किसी अन्य व्यक्ति को नामित करना।",
                "शिकायत निवारण — हमारे शिकायत अधिकारी से उत्तर।",
              ],
            },
            {
              type: "p",
              text: "/privacy/request पर गोपनीयता अनुरोध फ़ॉर्म का उपयोग करें या {{privacyEmail}} पर लिखें। यह निःशुल्क है। आपकी सुरक्षा के लिए, कार्रवाई से पहले हम आपकी पहचान की पुष्टि करते हैं (आमतौर पर खाते के मोबाइल नंबर या ईमेल पर एक बार के कोड से)।",
            },
            {
              type: "p",
              text: "यदि आप खाता चलाने या ऑर्डर पहुँचाने के लिए आवश्यक सहमति वापस लेते हैं, तो हम वह सेवा नहीं दे पाएँगे; हम आपको पहले बताएँगे।",
            },
          ],
        },
        {
          id: "consent",
          heading: "7. अपनी सहमति का प्रबंधन",
          blocks: [
            {
              type: "list",
              items: [
                "\"आपकी सहमतियाँ\" (/privacy/consents) पर आपकी वर्तमान पसंद और उनका इतिहास दिखता है, और आप वैकल्पिक उद्देश्य बंद कर सकते हैं।",
                "हर पेज के फ़ुटर में \"Cookie preferences\" से कुकी विकल्प फिर से खुलते हैं।",
                "हर ऑफ़र संदेश में सदस्यता समाप्त करने का विकल्प होता है।",
              ],
            },
            {
              type: "p",
              text: "हम हर पसंद का रिकॉर्ड रखते हैं (उद्देश्य, हाँ/नहीं, तारीख और समय, सूचना का संस्करण, और वह पेज या ऐप जहाँ से यह आई) ताकि हम प्रमाणित कर सकें कि आपने किस पर सहमति दी।",
            },
          ],
        },
        {
          id: "grievance",
          heading: "8. शिकायतें और डेटा संरक्षण बोर्ड",
          blocks: [
            {
              type: "p",
              text: "शिकायत अधिकारी: {{grievanceName}}, {{grievanceDesignation}}, {{entityName}}, {{registeredAddress}}। ईमेल {{grievanceEmail}} · फ़ोन {{grievancePhone}}।",
            },
            {
              type: "p",
              text: "हम हर शिकायत की प्राप्ति {{ackHours}} घंटों के भीतर स्वीकार करते हैं और उसे {{resolveDays}} दिनों के भीतर हल करने का प्रयास करते हैं।",
            },
            {
              type: "p",
              text: "यदि आप हमारे उत्तर से संतुष्ट नहीं हैं, तो हमारी शिकायत प्रक्रिया का उपयोग करने के बाद आप भारतीय डेटा संरक्षण बोर्ड में शिकायत कर सकते हैं।",
            },
          ],
        },
        {
          id: "children",
          heading: "9. बच्चे",
          blocks: [
            {
              type: "p",
              text: "यह स्टोर 18 वर्ष और उससे अधिक आयु के वयस्कों के लिए है। हम माता-पिता या वैध अभिभावक की सत्यापन योग्य सहमति के बिना 18 वर्ष से कम आयु के किसी व्यक्ति का व्यक्तिगत डेटा जानबूझकर नहीं लेते, और बच्चों को ट्रैक नहीं करते, उनके व्यवहार की निगरानी नहीं करते या उन्हें लक्षित विज्ञापन नहीं दिखाते। यदि आपको लगता है कि किसी बच्चे ने हमें व्यक्तिगत डेटा दिया है, तो {{privacyEmail}} पर संपर्क करें और हम उसे हटा देंगे।",
            },
          ],
        },
        {
          id: "security",
          heading: "10. सुरक्षा और डेटा उल्लंघन",
          blocks: [
            {
              type: "p",
              text: "हम उचित सुरक्षा उपाय अपनाते हैं: एन्क्रिप्टेड कनेक्शन (HTTPS), केवल आवश्यक कर्मचारियों को पहुँच, कर्मचारियों के लिए बहु-स्तरीय साइन-इन, एन्क्रिप्टेड सीक्रेट्स, और व्यक्तिगत डेटा तक पहुँच के लॉग।",
            },
            {
              type: "p",
              text: "यदि किसी व्यक्तिगत डेटा उल्लंघन से आप प्रभावित होते हैं, तो DPDP नियमों के अनुसार हम बिना देरी के आपको और भारतीय डेटा संरक्षण बोर्ड को सूचित करेंगे — क्या हुआ, संभावित प्रभाव, हम क्या कर रहे हैं, और आप क्या कर सकते हैं।",
            },
          ],
        },
        {
          id: "cookies",
          heading: "11. कुकीज़",
          blocks: [
            {
              type: "p",
              text: "जब तक आप वैकल्पिक कुकीज़ स्वीकार नहीं करते, हम केवल अत्यंत आवश्यक कुकीज़ का उपयोग करते हैं। कुकी नीति (/legal/cookies) में हर कुकी, उसका उद्देश्य और अवधि दी गई है।",
            },
          ],
        },
        {
          id: "changes",
          heading: "12. इस सूचना में बदलाव",
          blocks: [
            {
              type: "p",
              text: "हर संस्करण के ऊपर एक तारीख होती है। यदि हम कोई महत्वपूर्ण बदलाव करते हैं, तो हम साइट पर (और यदि आपका खाता है तो ईमेल या SMS से) बताएँगे और जहाँ कानून की आवश्यकता हो वहाँ फिर से सहमति माँगेंगे।",
            },
            {
              type: "p",
              text: "किसी भी अंतर की स्थिति में अंग्रेज़ी संस्करण देखें। यह अनुवाद कानूनी समीक्षा के अधीन है।",
            },
          ],
        },
      ],
    },
  },
};
