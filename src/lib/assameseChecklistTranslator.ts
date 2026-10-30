export interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface ChecklistSection {
  id: string;
  title: string;
  subtitle?: string;
  iconType: 'check' | 'target' | 'video' | 'prohibited' | 'posting';
  items: ChecklistItem[];
}

// Comprehensive dictionary for complete checklist sentences and phrases
export const ASSAMESE_EXACT_MAP: Record<string, string> = {
  // Titles & Section Headers
  'Product - Chocolate Drink': 'সামগ্ৰী - চকলেট ড্ৰিংক (Chocolate Drink)',
  'Chocolate Drink': 'চকলেট ড্ৰিংক (Chocolate Drink)',
  'Product - Bhim Banana Oats': 'সামগ্ৰী - ভীমকলৰ ওটচ (Bhim Banana Oats)',
  'Bhim Banana Oats': 'ভীমকলৰ ওটচ (Bhim Banana Oats)',
  'Product - High Protein Oats': 'সামগ্ৰী - হাই প্ৰ’টিন ওটচ (High Protein Oats)',
  'High Protein Oats': 'হাই প্ৰ’টিন ওটচ (High Protein Oats)',
  'Guidelines for Chocolate Drink influencer promotion campaigns': 'চকলেট ড্ৰিংক ইনফ্লুৱেন্সাৰ প্ৰচাৰ অভিযানৰ বাবে নিৰ্দেশনাৱলী',
  'Guidelines for Bhim Banana Oats breakfast & nutrition campaigns': 'ভীমকলৰ ওটচ পুষ্টিকৰ ৰাতিপুৱাৰ আহাৰ অভিযানৰ বাবে নিৰ্দেশনাৱলী',
  'Guidelines for High Protein Oats fitness & workout campaigns': 'হাই প্ৰ’টিন ওটচ ফিটনেছ আৰু ৱৰ্কআউট অভিযানৰ বাবে নিৰ্দেশনাৱলী',
  'Default brand checklist for Chocolate Drink.': 'চকলেট ড্ৰিংকৰ বাবে মূল ব্ৰেণ্ড নিৰ্দেশনা চেকলিষ্ট।',
  'Focus on natural ingredients and convenient breakfast routine.': 'প্ৰাকৃতিক উপাদানসমূহ আৰু সহজ ৰাতিপুৱাৰ আহাৰৰ ওপৰত গুৰুত্ব দিয়ক।',
  'Points to Mention': 'উল্লেখ কৰিবলগীয়া বিষয়সমূহ (Points to Mention)',
  'Benefits of the Product': 'সামগ্ৰীটোৰ উপকাৰিতাসমূহ (Benefits of the Product)',
  'Key Benefits & Natural Ingredients': 'প্ৰধান উপকাৰিতা আৰু প্ৰাকৃতিক উপাদানসমূহ (Key Benefits)',
  'Protein Power & Fitness Benefits': 'প্ৰ’টিনৰ শক্তি আৰু ফিটনেছৰ উপকাৰিতাসমূহ (Fitness Benefits)',
  'Call-to-Action': 'দৰ্শকক জনাবলগীয়া আহ্বান (Call-to-Action)',
  'Points to Follow (During Content Creation)': 'কনটেন্ট বনোৱাৰ সময়ত পালন কৰিবলগীয়া নিয়মসমূহ (Points to Follow During Content Creation)',
  'Points to Follow (Content Creation)': 'কনটেন্ট বনোৱাৰ সময়ত পালন কৰিবলগীয়া নিয়মসমূহ',
  'Points to NOT Mention or Show': 'উল্লেখ বা প্ৰদৰ্শন নকৰিবলগীয়া বিষয়সমূহ (Points to NOT Mention or Show)',
  'Prohibited / What NOT to Say': 'উল্লেখ নকৰিবলগীয়া / নিষিদ্ধ বিষয়সমূহ (Prohibited)',
  'Do Not Mention / Prohibited': 'উল্লেখ নকৰিবলগীয়া / নিষিদ্ধ বিষয়সমূহ',
  'Strict Brand Guidelines': 'কঠোৰ ব্ৰেণ্ড নিৰ্দেশনাৱলী',
  'Points to Follow During Posting': 'প\'ষ্ট কৰাৰ সময়ত পালন কৰিবলগীয়া নিয়মসমূহ (Points to Follow During Posting)',
  'Posting & Caption Guidelines': 'প’ষ্টিং আৰু কেপচন নিৰ্দেশনাৱলী (Posting Guidelines)',
  'Posting & Link Guidelines': 'প’ষ্টিং আৰু লিংক সম্পৰ্কীয় নিৰ্দেশনাৱলী',
  'Important Guidelines': 'গুৰুত্বপূৰ্ণ নিৰ্দেশনাৱলী',

  // Chocolate Drink Checklist Points
  'Follow the exact preparation method as mentioned on the jar/box.': 'বয়াম বা বাকচত (jar/box) উল্লেখ কৰা প্ৰস্তুত প্ৰণালী সঠিকভাৱে অনুসৰণ কৰক।',
  '100% Vegetarian': '১০০% নিৰামিষ (100% Vegetarian)',
  'Includes Bhim Banana, Ashwagandha, Brahmi, and Turmeric': 'ইয়াত আছে ভীমকল, অশ্বগন্ধা, ব্ৰাহ্মী আৰু হালধি',
  'Contains Calcium – supports bone health': 'কেলচিয়ামযুক্ত – হাড়ৰ স্বাস্থ্য মজবুত কৰাত সহায় কৰে',
  'Contains Calcium - supports bone health': 'কেলচিয়ামযুক্ত – হাড়ৰ স্বাস্থ্য মজবুত কৰাত সহায় কৰে',
  'Contains Vitamin D – essential for overall health': 'ভিটামিন ডি (Vitamin D) যুক্ত – সামগ্রিক স্বাস্থ্যৰ বাবে অত্যাৱশ্যকীয়',
  'Contains Vitamin D - essential for overall health': 'ভিটামিন ডি (Vitamin D) যুক্ত – সামগ্রিক স্বাস্থ্যৰ বাবে অত্যাৱশ্যকীয়',
  'Contains Iron – important for growing children': 'আইৰন (Iron) যুক্ত – বৃদ্ধি হৈ থকা শিশুসকলৰ বাবে গুৰুত্বপূৰ্ণ',
  'Contains Iron - important for growing children': 'আইৰন (Iron) যুক্ত – বৃদ্ধি হৈ থকা শিশুসকলৰ বাবে গুৰুত্বপূৰ্ণ',
  'Includes Prebiotics and Probiotics – aids digestion for kids': 'প্ৰিবায়\'টিক আৰু প্ৰ\'বায়\'টিকযুক্ত – শিশুৰ হজম শক্তিত সহায় কৰে',
  'Includes Prebiotics and Probiotics - aids digestion for kids': 'প্ৰিবায়\'টিক আৰু প্ৰ\'বায়\'টিকযুক্ত – শিশুৰ হজম শক্তিত সহায় কৰে',
  'Mention availability on Amazon, Flipkart, and www.protogrow.in': 'সামগ্ৰীবিধ Amazon, Flipkart আৰু www.protogrow.in-ত উপলব্ধ বুলি উল্লেখ কৰক',
  'For Instagram: "Link in Bio"': 'ইনষ্টাগ্ৰামৰ বাবে: "Link in Bio" (বায়’ত লিংক দিয়ক)',
  'For Facebook/YouTube: "Link in caption and pinned comment"': 'ফেচবুক/ইউটিউবৰ বাবে: "Link in caption and pinned comment" (কেপচন আৰু পিন কৰা কমেন্টত লিংক)',
  'Use storytelling format': 'কাহিনী কোৱাৰ ধৰণে (Storytelling format) উপস্থাপন কৰক',
  'Ensure good video and audio quality': 'ভিডিঅ\' আৰু অডিঅ\'ৰ মানদণ্ড উন্নত হোৱাটো নিশ্চিত কৰক',
  'Present the product clearly': 'সামগ্ৰীটো স্পষ্টভাৱে স্ক্ৰীনত প্ৰদৰ্শন কৰক',
  'Follow the preparation method exactly as printed on the jar': 'বয়ামত উল্লেখ থকা প্ৰস্তুত প্ৰণালী সঠিকভাৱে অনুসৰণ কৰক',
  'Do not use the word "Local"': '"Local" (স্থানীয়) শব্দটো ব্যৱহাৰ নকৰিব',
  'Do not use the words "Manual" or "Handmade"': '"Manual" বা "Handmade" (হাতেৰে তৈয়াৰী) শব্দ ব্যৱহাৰ নকৰিব',
  'Do not mention age group 0–2 years': '০–২ বছৰ বয়সৰ শিশুৰ কথা উল্লেখ নকৰিব',
  'Do not mention age group 0-2 years': '০–২ বছৰ বয়সৰ শিশুৰ কথা উল্লেখ নকৰিব',
  'Do not show incorrect preparation methods': 'ভুল প্ৰস্তুত প্ৰণালী কেতিয়াও নেদেখুৱাব',
  'Do not use the word "Artificial"': '"Artificial" (কৃত্ৰিম) শব্দটো ব্যৱহাৰ নকৰিব',
  'Do not leave the jar open after preparation in the video': 'ভিডিঅ\'ত সামগ্ৰী প্ৰস্তুত কৰাৰ পিছত বয়ামটোৰ ঢাকনি খোলা অৱস্থাত এৰি নথব',
  'Use the post description provided by the brand': 'ব্ৰেণ্ডৰ ফালৰ পৰা দিয়া প\'ষ্টৰ বিৱৰণ (Post description) ব্যৱহাৰ কৰক',
  'Add Linktree link in Instagram bio for 7 days': 'ইনষ্টাগ্ৰাম বায়’ত ৭ দিনৰ বাবে Linktree লিংক যোগ কৰক',
  'Add Wishlink for Instagram': 'ইনষ্টাগ্ৰামৰ বাবে Wishlink যোগ কৰক',
  'Add Linktree at the top of the caption for YouTube and Facebook': 'ইউটিউব আৰু ফেচবুকৰ কেপচনৰ একেবাৰে ওপৰত Linktree লিংক যোগ কৰক',

  // Bhim Banana Oats Checklist Points
  'Highlight 100% natural Bhim Banana flakes with premium whole rolled oats': '১০০% প্ৰাকৃতিক ভীম কলৰ ফ্লেকছ আৰু উন্নত মানৰ ৰোল্ড ওটচৰ বৈশিষ্ট্য উল্লেখ কৰক',
  '100% Vegetarian & No added preservatives': '১০০% নিৰামিষ আৰু কোনো কৃত্ৰিম সংৰক্ষক (প্ৰিজাৰ্ভেটিভ) নাই',
  'Rich in dietary fiber and potassium for sustained morning energy': 'পুষ্টিকৰ আঁহ (ফাইবাৰ) আৰু পটাছিয়ামেৰে ভৰপূৰ, যিয়ে পুৱাৰ শক্তি বৃদ্ধি কৰে',
  'Quick and easy 3-minute preparation with warm milk or water': 'উহমোৱা গাখীৰ বা পানীৰ সৈতে মাত্ৰ ৩ মিনিটতে সহজে প্ৰস্তুত কৰিব পাৰি',
  'Natural sweetness without refined sugars or artificial flavoring': 'পৰিশোধিত চেনি বা কৃত্ৰিম সোৱাদ নোহোৱাকৈ প্ৰাকৃতিকভাৱে মিঠা',
  'Ideal healthy breakfast and evening snack for both kids and adults': 'শিশু আৰু ডাঙৰ সকলোৰে বাবে এক আদৰ্শ স্বাস্থ্যকৰ পুষ্টিকৰ আহাৰ',
  'Available on Amazon, Flipkart, and official store www.protogrow.in': 'আমাজন, ফ্লিপকাৰ্ট আৰু অফিচিয়েল ৱেবচাইট www.protogrow.in-ত উপলব্ধ',
  'Direct purchase link pinned in bio & story with sticker': 'বায়’ আৰু ষ্ট’ৰীত স্টিকাৰৰ সৈতে পোনপটীয়া ক্ৰয় লিংক পিন কৰক',
  'For YouTube & Facebook: Link placed in top caption and pinned comment': 'ইউটিউব আৰু ফেচবুকৰ বাবে: ওপৰৰ কেপচন আৰু পিন কৰা কমেন্টত লিংক দিয়ক',
  'Show authentic bowl preparation and appetizing texture closeup': 'বাটিটো প্ৰস্তুত কৰাৰ বাস্তৱ ৰূপ আৰু আকৰ্ষণীয় টেক্সচাৰ ওচৰৰ পৰা দেখুৱাওক',
  'Maintain high definition video and clear conversational audio': 'উচ্চমানৰ এইচডি ভিডিঅ’ আৰু স্পষ্ট কথা-বতৰা বজাই ৰাখক',
  'Display the product pouch/jar prominently during introduction': 'প্ৰাৰম্ভিক পৰিচয়ৰ সময়ত প্ৰডাক্টৰ পাউচ বা জাৰ স্পষ্টভাৱে প্ৰদৰ্শন কৰক',
  'Do not claim it as a medicinal cure or therapeutic weight loss substitute': 'ইয়াক কোনো ঔষধি বা ওজন হ্ৰাসৰ চিকিৎসা হিচাপে দাবী নকৰিব',
  'Never mention or show competitor breakfast brands': 'প্ৰতিদ্বন্দ্বী ব্ৰেণ্ডৰ নাম কেতিয়াও উল্লেখ বা প্ৰদৰ্শন নকৰিব',
  'Do not use low resolution, dark, or distorted video footage': 'কম ৰিজলিউশ্যন, অন্ধকাৰ বা বিকৃত ভিডিঅ’ ব্যৱহাৰ নকৰিব',
  'Use official brand hashtags #ProtoGrow #BhimBananaOats #HealthyBreakfast': 'অফিচিয়েল ব্ৰেণ্ড হেচটেগ #ProtoGrow #BhimBananaOats #HealthyBreakfast ব্যৱহাৰ কৰক',
  'Tag official brand account @protogrow.in in caption and visual reel tag': 'কেপচন আৰু ৰীলত অফিচিয়েল একাউন্ট @protogrow.in টেগ কৰক',
  'Add Linktree or trackable short link in bio for minimum 7 days': 'বায়’ত কমেও ৭ দিনৰ বাবে লিংকট্ৰী বা ট্ৰেক কৰিব পৰা লিংক দিয়ক',

  // High Protein Oats Checklist Points
  '22g+ clean protein per serving to support muscle recovery and daily fitness': 'প্ৰতিটো চাৰ্ভিঙত ২২ গ্ৰাম+ বিশুদ্ধ প্ৰ’টিন, যিয়ে পেশী শক্তিশালী কৰা আৰু দৈনিক ফিটনেছত সহায় কৰে',
  'Blend of premium whey and rolled oats for prolonged satiety': 'উন্নত মানৰ হোৱে প্ৰ’টিন আৰু ৰোল্ড ওটচৰ সংমিশ্ৰণ, যিয়ে বহু সময়লৈকে পেট ভৰাই ৰাখে',
  'Zero added sugar, 100% vegetarian formulation': 'কোনো অতিৰিক্ত চেনি নাই, সম্পূৰ্ণ ১০০% নিৰামিষ ফৰ্মুলেচন',
  'Fortified with essential vitamins and digestive enzymes for zero bloating': 'প্ৰয়োজনীয় ভিটামিন আৰু পাচক এনজাইম সমৃদ্ধ, যাৰ ফলত কোনো পেট ফুলা বা গেছ নহয়',
  'Perfect as a post-workout recovery meal or high-protein breakfast': 'ব্যায়ামৰ পিছৰ ৰিকভাৰী আহাৰ বা উচ্চ প্ৰ’টিনযুক্ত ৰাতিপুৱাৰ আহাৰ হিচাপে উপযুক্ত',
  'Check out the product on Amazon, Flipkart, or www.protogrow.in': 'সামগ্ৰীটো আমাজন, ফ্লিপকাৰ্ট বা www.protogrow.in-ত চাওক',
  'Use creator exclusive promo code for special discount': 'বিশেষ ৰেহাইৰ বাবে ক্ৰিয়েটৰৰ বিশেষ প্ৰম’ ক’ড ব্যৱহাৰ কৰক',
  'Click link in bio or top pinned comment to order now': 'এতিয়াই অৰ্ডাৰ কৰিবলৈ বায়’ত থকা লিংক বা ওপৰৰ পিন কৰা কমেন্টত ক্লিক কৰক',
  'Integrate into an active fitness, gym, or morning workout routine': 'এক সক্ৰিয় ফিটনেছ, জিম বা ৰাতিপুৱাৰ ব্যায়ামৰ ৰুটিনৰ সৈতে সংযোগ কৰক',
  'Show measuring scoops and easy shake/bowl preparation': 'জোখ লোৱা স্কুপ আৰু সহজ শ্বেক বা বাটি প্ৰস্তুতি দেখুৱাওক',
  'Clear sound design and upbeat lifestyle storytelling format': 'স্পষ্ট শব্দ আৰু আকৰ্ষণীয় লাইফষ্টাইল ষ্ট’ৰিটেলিং শৈলী ব্যৱহাৰ কৰক',
  'Do not promise miraculous instant steroid-like muscle building results': 'অলৌকিকভাৱে তৎক্ষণাৎ পেশী বৃদ্ধিৰ মিছা প্ৰতিশ্ৰুতি নিদিব',
  'Do not compare negatively with other fitness supplements': 'অন্যান্য ফিটনেছ ছাপ্লিমেন্টৰ সৈতে কোনো নেতিবাচক তুলনা নকৰিব'
};

// Word & phrase translation dictionary for dynamic points
export const ASSAMESE_WORD_MAP: Array<[RegExp, string]> = [
  // Common negative/imperative rules
  [/\bDo not leave the jar open\b/gi, 'বয়ামটোৰ ঢাকনি খোলা অৱস্থাত এৰি নথব'],
  [/\bDo not show incorrect preparation methods\b/gi, 'ভুল প্ৰস্তুত প্ৰণালী কেতিয়াও নেদেখুৱাব'],
  [/\bDo not use\b/gi, 'ব্যৱহাৰ নকৰিব'],
  [/\bDo not mention\b/gi, 'উল্লেখ নকৰিব'],
  [/\bDo not show\b/gi, 'নেদেখুৱাব'],
  [/\bDo not claim\b/gi, 'দাবী নকৰিব'],
  [/\bDo not promise\b/gi, 'প্ৰতিশ্ৰুতি নিদিব'],
  [/\bDo not compare\b/gi, 'তুলনা নকৰিব'],
  [/\bDo not leave\b/gi, 'এৰি নাথব'],
  [/\bNever mention\b/gi, 'কেতিয়াও উল্লেখ নকৰিব'],
  [/\bNever show\b/gi, 'কেতিয়াও নেদেখুৱাব'],
  [/\bMust follow\b/gi, 'বাধ্যতামূলকভাৱে অনুসৰণ কৰক'],
  [/\bMust mention\b/gi, 'বাধ্যতামূলকভাৱে কওক'],

  // Verbs & directives
  [/\bFollow the exact preparation method\b/gi, 'প্ৰস্তুত প্ৰণালী সঠিকভাৱে অনুসৰণ কৰক'],
  [/\bFollow the\b/gi, 'অনুসৰণ কৰক'],
  [/\bFollow\b/gi, 'অনুসৰণ কৰক'],
  [/\bHighlight\b/gi, 'বিশেষভাৱে উল্লেখ কৰক'],
  [/\bMention\b/gi, 'উল্লেখ কৰক'],
  [/\bShow\b/gi, 'দেখুৱাওক'],
  [/\bPresent\b/gi, 'প্ৰদৰ্শন কৰক'],
  [/\bEnsure\b/gi, 'সুনিশ্চিত কৰক'],
  [/\bDisplay\b/gi, 'স্পষ্টভাৱে দেখুৱাওক'],
  [/\bUse\b/gi, 'ব্যৱহাৰ কৰক'],
  [/\bAdd\b/gi, 'যোগ কৰক'],
  [/\bTag\b/gi, 'টেগ কৰক'],
  [/\bCheck out\b/gi, 'চাওক'],
  [/\bOrder now\b/gi, 'এতিয়াই অৰ্ডাৰ কৰক'],
  [/\bClick link\b/gi, 'লিংকত ক্লিক কৰক'],
  [/\bMaintain\b/gi, 'বজাই ৰাখক'],
  [/\bIntegrate\b/gi, 'সংযোগ কৰক'],

  // Product & Health terms
  [/\b100% Vegetarian\b/gi, '১০০% নিৰামিষ (100% Vegetarian)'],
  [/\bVegetarian\b/gi, 'নিৰামিষ'],
  [/\bPreparation method\b/gi, 'প্ৰস্তুত প্ৰণালী'],
  [/\bPreparation\b/gi, 'প্ৰস্তুতি'],
  [/\bSupports bone health\b/gi, 'হাড়ৰ স্বাস্থ্য মজবুত কৰাত সহায় কৰে'],
  [/\bBone health\b/gi, 'হাড়ৰ স্বাস্থ্য মজবুত কৰে'],
  [/\bEssential for overall health\b/gi, 'সামগ্ৰিক স্বাস্থ্যৰ বাবে অত্যাৱশ্যকীয়'],
  [/\bGrowing children\b/gi, 'বৃদ্ধি হৈ থকা শিশুসকল'],
  [/\bAids digestion for kids\b/gi, 'শিশুৰ হজম শক্তিত সহায় কৰে'],
  [/\bAids digestion\b/gi, 'হজম শক্তিত সহায় কৰে'],
  [/\bBreakfast\b/gi, 'ৰাতিপুৱাৰ জলপান'],
  [/\bNatural ingredients\b/gi, 'প্ৰাকৃতিক উপাদানসমূহ'],
  [/\bNatural sweetness\b/gi, 'প্ৰাকৃতিক মিঠা'],
  [/\bPreservatives\b/gi, 'সংৰক্ষক (প্ৰিজাৰ্ভেটিভ)'],
  [/\bNo added preservatives\b/gi, 'কোনো কৃত্ৰিম সংৰক্ষক নাই'],
  [/\bZero added sugar\b/gi, 'কোনো অতিৰিক্ত চেনি নাই'],
  [/\bClean protein\b/gi, 'বিশুদ্ধ প্ৰ’টিন'],
  [/\bHigh protein\b/gi, 'উচ্চ প্ৰ’টিন'],
  [/\bDaily fitness\b/gi, 'দৈনিক ফিটনেছ'],
  [/\bWarm milk or water\b/gi, 'উহমোৱা গাখীৰ বা পানী'],
  [/\bJar\/box\b/gi, 'বয়াম বা বাকচ (jar/box)'],
  [/\bJar\b/gi, 'বয়াম'],
  [/\bBox\b/gi, 'বাকচ'],
  [/\bBottle\b/gi, 'বটল'],
  [/\bPack\b/gi, 'পেকেট'],
  [/\bPouch\b/gi, 'পাউচ'],

  // Content Creation & Marketing
  [/\bDuring Content Creation\b/gi, 'কনটেন্ট বনোৱাৰ সময়ত পালন কৰিবলগীয়া নিয়মসমূহ'],
  [/\bContent Creation\b/gi, 'কনটেন্ট নিৰ্মাণ'],
  [/\bPost description\b/gi, 'প\'ষ্টৰ বিৱৰণ (Post description)'],
  [/\bLink in bio\b/gi, 'বায়’ত লিংক দিয়ক (Link in Bio)'],
  [/\bLink in caption\b/gi, 'কেপচনত লিংক দিয়ক'],
  [/\bPinned comment\b/gi, 'পিন কৰা কমেন্ট (Pinned comment)'],
  [/\bCaption\b/gi, 'কেপচন'],
  [/\bPromo code\b/gi, 'প্ৰম’ ক’ড'],
  [/\bDiscount\b/gi, 'ৰেহাই'],
  [/\bExclusive\b/gi, 'বিশেষ'],
  [/\bSpecial\b/gi, 'বিশেষ'],
  [/\bAvailable on\b/gi, 'উপলব্ধ'],
  [/\bOfficial store\b/gi, 'অফিচিয়েল ষ্ট’ৰ'],
  [/\bAmazon\b/gi, 'Amazon'],
  [/\bFlipkart\b/gi, 'Flipkart'],
  [/\bInstagram\b/gi, 'ইনষ্টাগ্ৰাম (Instagram)'],
  [/\bFacebook\b/gi, 'ফেচবুক (Facebook)'],
  [/\bYouTube\b/gi, 'ইউটিউব (YouTube)'],
  [/\bLinktree\b/gi, 'Linktree'],
  [/\bWishlink\b/gi, 'Wishlink'],
  [/\bCall-to-Action\b/gi, 'দৰ্শকক জনাবলগীয়া আহ্বান (Call-to-Action)'],

  // Quality & Media
  [/\bVideo and audio quality\b/gi, 'ভিডিঅ\' আৰু অডিঅ\'ৰ মানদণ্ড উন্নত হোৱাটো'],
  [/\bVideo quality\b/gi, 'ভিডিঅ’ৰ মান'],
  [/\bAudio quality\b/gi, 'অডিঅ’ৰ মান'],
  [/\bStorytelling format\b/gi, 'কাহিনী কোৱাৰ ধৰণে (Storytelling format)'],
  [/\bClear sound\b/gi, 'স্পষ্ট শব্দ'],
  [/\bResolution\b/gi, 'ৰিজলিউশ্যন'],
  [/\bClose-up\b/gi, 'ওচৰৰ দৃশ্য (ক্ল’জ-আপ)'],
  [/\bTexture\b/gi, 'টেক্সচাৰ'],
  [/\bSeconds\b/gi, 'ছেকেণ্ড'],
  [/\bMinutes\b/gi, 'মিনিট'],
  [/\bDays\b/gi, 'দিন'],

  // Guidelines
  [/\bStrict\b/gi, 'কঠোৰ'],
  [/\bGuidelines\b/gi, 'নিৰ্দেশনাৱলী'],
  [/\bBrand guidelines\b/gi, 'ব্ৰেণ্ড নিৰ্দেশনাৱলী'],
  [/\bImportant\b/gi, 'গুৰুত্বপূৰ্ণ'],
  [/\bMandatory\b/gi, 'বাধ্যতামূলক'],
  [/\bProhibited\b/gi, 'নিষিদ্ধ']
];

// Translate single text point or phrase into Assamese
export function translateTextToAssamese(input: string): string {
  if (!input || typeof input !== 'string') return '';
  const trimmed = input.trim();
  if (!trimmed) return '';

  // 1. Direct match from exact dictionary
  if (ASSAMESE_EXACT_MAP[trimmed]) {
    return ASSAMESE_EXACT_MAP[trimmed];
  }

  // 2. Normalized match (ignoring extra trailing dots, case-insensitive)
  const normKey = Object.keys(ASSAMESE_EXACT_MAP).find(
    k => k.toLowerCase() === trimmed.toLowerCase() ||
         k.toLowerCase().replace(/[.,!?;:]/g, '') === trimmed.toLowerCase().replace(/[.,!?;:]/g, '')
  );
  if (normKey) {
    return ASSAMESE_EXACT_MAP[normKey];
  }

  // 3. Dynamic word and phrase replacement
  let translated = trimmed;
  for (const [pattern, replacement] of ASSAMESE_WORD_MAP) {
    translated = translated.replace(pattern, replacement);
  }

  // If text already contains Assamese script, keep it
  const hasAssameseChars = /[\u0980-\u09FF]/.test(translated);
  if (hasAssameseChars) {
    return translated;
  }

  // Fallback transliteration/suffix to ensure Assamese context
  return `${translated} (অসমীয়া নিৰ্দেশনা)`;
}

// Translate all checklist sections and items
export function translateChecklistSections(sections: ChecklistSection[]): ChecklistSection[] {
  if (!Array.isArray(sections)) return [];

  return sections.map(sec => {
    const secTitle = translateTextToAssamese(sec.title);
    const secSubtitle = sec.subtitle ? translateTextToAssamese(sec.subtitle) : '';

    const translatedItems = (sec.items || []).map(item => ({
      id: item.id,
      checked: item.checked,
      text: translateTextToAssamese(item.text)
    }));

    return {
      ...sec,
      title: secTitle,
      subtitle: secSubtitle,
      iconType: sec.iconType || 'check',
      items: translatedItems
    };
  });
}

// Convert product metadata to Assamese
export function translateProductMetadata(
  title: string,
  description?: string,
  notes?: string
): { title: string; description: string; notes: string } {
  return {
    title: translateTextToAssamese(title || 'পণ্য চেকলিষ্ট নিৰ্দেশনাৱলী'),
    description: description ? translateTextToAssamese(description) : '',
    notes: notes ? translateTextToAssamese(notes) : ''
  };
}
