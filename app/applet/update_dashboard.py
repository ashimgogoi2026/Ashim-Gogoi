with open('src/components/VideoCampaignDashboard.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

repl1_old = """                                          const editedVideoReadyMsg = getEditedVideoReadyCheckWhatsAppText(
                                            influencerName,
                                            deliverableProductName,
                                            task.releaseDate || task.deadline || scheduledDate,
                                            whatsAppLanguage
                                          );
                                          const sampleReceivedMsg = getSampleReceivedWhatsAppText(influencerName, deliverableProductName, task.orderDate, whatsAppLanguage);"""

repl1_new = """                                          const editedVideoReadyMsg = getEditedVideoReadyCheckWhatsAppText(
                                            influencerName,
                                            deliverableProductName,
                                            task.releaseDate || task.deadline || scheduledDate,
                                            whatsAppLanguage
                                          );
                                          const isTodaySunday = new Date().getDay() === 0;
                                          const officeHoursFeedbackMsg = getOfficeHoursFeedbackNoticeWhatsAppText(
                                            influencerName,
                                            deliverableProductName,
                                            isTodaySunday,
                                            whatsAppLanguage
                                          );
                                          const sampleReceivedMsg = getSampleReceivedWhatsAppText(influencerName, deliverableProductName, task.orderDate, whatsAppLanguage);"""

assert repl1_old in content, 'repl1_old not found'
content = content.replace(repl1_old, repl1_new, 1)

repl2_old = """                                                      language: whatsAppLanguage,
                                                      amount: taskAmt,
                                                      paymentDetails: task.paymentDetails || ''
                                                    });
                                                  }}
                                                  title={`WhatsApp options for ${influencerName} (English / অসমীয়া)`}"""

repl2_new = """                                                      language: whatsAppLanguage,
                                                      amount: taskAmt,
                                                      paymentDetails: task.paymentDetails || '',
                                                      isSundayNotice: isTodaySunday
                                                    });
                                                  }}
                                                  title={`WhatsApp options for ${influencerName} (English / অসমীয়া)`}"""

assert repl2_old in content, 'repl2_old not found'
content = content.replace(repl2_old, repl2_new, 1)

repl3_old = """                                                  {/* Option: Is Edited Video Ready? */}
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setActiveWhatsAppMenuTaskId(null);
                                                      handleDirectSend(editedVideoReadyMsg);
                                                    }}
                                                    className="w-full text-left px-2 py-1.5 hover:bg-indigo-50 rounded-lg text-xs font-bold text-indigo-950 flex items-start gap-2 transition cursor-pointer border border-indigo-100 bg-indigo-50/40 my-0.5"
                                                    title="Ask if the edited video is ready and request final draft cut"
                                                  >
                                                    <span className="text-sm mt-0.5">🎬</span>
                                                    <div className="min-w-0 flex-1">
                                                      <div className="flex items-center gap-1.5">
                                                        <span className="font-extrabold text-indigo-950 truncate">
                                                          {whatsAppLanguage === 'as' ? "এডিটেড ভিডিঅ' সাজু নেকি?" : "Edited Video Ready?"}
                                                        </span>
                                                        <span className="text-[9px] bg-indigo-600 text-white px-1 py-0.2 rounded font-black uppercase shadow-2xs">
                                                          {whatsAppLanguage === 'as' ? "সাজু নেকি?" : "Ready?"}
                                                        </span>
                                                      </div>
                                                      <p className="text-[10px] text-indigo-700 font-normal leading-tight mt-0.5 truncate">
                                                        {whatsAppLanguage === 'as' ? "এডিট সম্পূৰ্ণ হ'ল নে সুধক আৰু কাট বিচাৰক" : "Ask if edited cut is ready for review"}
                                                      </p>
                                                    </div>
                                                  </button>"""

repl3_new = repl3_old + """

                                                  {/* Option: Office Hours (10 AM - 6 PM) & Video Feedback Notice */}
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setActiveWhatsAppMenuTaskId(null);
                                                      handleDirectSend(officeHoursFeedbackMsg);
                                                    }}
                                                    className="w-full text-left px-2 py-1.5 hover:bg-amber-50 rounded-lg text-xs font-bold text-amber-950 flex items-start gap-2 transition cursor-pointer border border-amber-200/80 bg-amber-50/40 my-0.5"
                                                    title="Notify creator about office hours (10 AM - 6 PM), after-hours/Sunday timing, feedback tomorrow, and personal reply"
                                                  >
                                                    <span className="text-sm mt-0.5">⏰</span>
                                                    <div className="min-w-0 flex-1">
                                                      <div className="flex items-center gap-1.5">
                                                        <span className="font-extrabold text-amber-950 truncate">
                                                          {whatsAppLanguage === 'as' ? "অফিচ সময় আৰু ফিডবেক জাননী" : "Office Hours & Feedback Notice"}
                                                        </span>
                                                        <span className="text-[9px] bg-amber-600 text-white px-1 py-0.2 rounded font-black uppercase shadow-2xs">
                                                          {isTodaySunday 
                                                            ? (whatsAppLanguage === 'as' ? "দেওবাৰ বন্ধ" : "Sunday Off")
                                                            : "10AM-6PM"}
                                                        </span>
                                                      </div>
                                                      <p className="text-[10px] text-amber-800 font-normal leading-tight mt-0.5 truncate">
                                                        {whatsAppLanguage === 'as'
                                                          ? "১০ AM - ৬ PM অফিচ, কাইলৈ দলীয় ফিডবেক; ব্যক্তিগত উত্তৰ উপলব্ধ"
                                                          : "10 AM - 6 PM office, team feedback tomorrow; personal reply now"}
                                                      </p>
                                                    </div>
                                                  </button>"""

assert repl3_old in content, 'repl3_old not found'
content = content.replace(repl3_old, repl3_new, 1)

repl4_old = """                  {/* Template: Edited Video Ready Check */}
                  <button
                    type="button"
                    onClick={() => {
                      const text = getEditedVideoReadyCheckWhatsAppText(
                        whatsAppModalData.influencerName,
                        whatsAppModalData.productName,
                        whatsAppModalData.releaseDate,
                        whatsAppModalData.language
                      );
                      setWhatsAppModalData(prev => prev ? {
                        ...prev,
                        selectedTemplate: 'edited_video_ready_check',
                        customText: text
                      } : null);
                    }}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      whatsAppModalData.selectedTemplate === 'edited_video_ready_check'
                        ? 'border-indigo-500 bg-indigo-50/90 shadow-xs ring-2 ring-indigo-500/20'
                        : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-extrabold text-xs text-indigo-950 flex items-center gap-1.5">
                        <span>🎬</span>
                        <span>{whatsAppModalData.language === 'as' ? "এডিটেড ভিডিঅ' সাজু নেকি?" : "Edited Video Ready?"}</span>
                      </span>
                      <span className="bg-indigo-600 text-white text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full shadow-2xs">
                        {whatsAppModalData.language === 'as' ? "সাজু নেকি?" : "Ready?"}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      {whatsAppModalData.language === 'as'
                        ? "ক্ৰিয়েটৰক সোধক যে এডিটেড ভিডিঅ'ৰ কাম সম্পূৰ্ণ হৈ সাজু হৈছে নেকি আৰু নিৰীক্ষণৰ বাবে ড্ৰাফট লিংক জমা দিবলৈ কওক"
                        : "Ask creator if their edited video is ready and request draft/cut submission for review."}
                    </p>
                  </button>"""

repl4_new = repl4_old + """

                  {/* Template: Office Hours (10 AM - 6 PM) & Video Feedback Notice */}
                  <button
                    type="button"
                    onClick={() => {
                      const isSunday = typeof whatsAppModalData.isSundayNotice === 'boolean'
                        ? whatsAppModalData.isSundayNotice
                        : new Date().getDay() === 0;
                      const text = getOfficeHoursFeedbackNoticeWhatsAppText(
                        whatsAppModalData.influencerName,
                        whatsAppModalData.productName,
                        isSunday,
                        whatsAppModalData.language
                      );
                      setWhatsAppModalData(prev => prev ? {
                        ...prev,
                        selectedTemplate: 'office_hours_feedback_notice',
                        isSundayNotice: isSunday,
                        customText: text
                      } : null);
                    }}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      whatsAppModalData.selectedTemplate === 'office_hours_feedback_notice'
                        ? 'border-amber-500 bg-amber-50/90 shadow-xs ring-2 ring-amber-500/20'
                        : 'border-slate-200 bg-white hover:border-amber-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-extrabold text-xs text-amber-950 flex items-center gap-1.5">
                        <span>⏰</span>
                        <span>{whatsAppModalData.language === 'as' ? "অফিচ সময় (১০-৬) আৰু ফিডবেক" : "Office Hours & Feedback Notice"}</span>
                      </span>
                      <span className="bg-amber-600 text-white text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full shadow-2xs">
                        10AM - 6PM
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      {whatsAppModalData.language === 'as'
                        ? "অফিচৰ সময় ১০ AM - ৬ PM, সময়ৰ পিছত/দেওবাৰে দলীয় ফিডবেক কাইলৈ দিয়া হ'ব আৰু এতিয়া ব্যক্তিগত উত্তৰ দিয়াৰ জাননী"
                        : "Office hours 10 AM - 6 PM. After hours or Sunday team feedback is given tomorrow; personal reply available now."}
                    </p>
                  </button>"""

assert repl4_old in content, 'repl4_old not found'
content = content.replace(repl4_old, repl4_new, 1)

repl5_old = """              {/* Video Upload Reminder Banner */}
              {whatsAppModalData.selectedTemplate === 'video_upload_reminder' && ("""

repl5_new = """              {/* Office Hours (10 AM - 6 PM) & Video Feedback Notice Banner */}
              {whatsAppModalData.selectedTemplate === 'office_hours_feedback_notice' && (
                <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-indigo-50 border border-amber-200 rounded-2xl p-4 shadow-sm animate-in fade-in duration-150 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-gradient-to-br from-amber-600 to-orange-600 text-white rounded-xl shadow-xs">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-amber-950 flex items-center gap-1.5">
                          <span>{whatsAppModalData.language === 'as' ? "অফিচ সময় (১০ AM - ৬ PM) আৰু ফিডবেক জাননী" : "Office Working Hours & Feedback Notice"}</span>
                        </h4>
                        <p className="text-[11px] text-amber-800">
                          {whatsAppModalData.language === 'as'
                            ? "অফিচৰ সময় পুৱা ১০:০০ বজাৰ পৰা সন্ধিয়া ৬:০০ বজা। সন্ধিয়া ৬ বজাৰ পিছত বা দেওবাৰে দলীয় আনুষ্ঠানিক ফিডবেক কাইলৈ দিয়া হ'ব; ব্যক্তিগতভাৱে এতিয়াও উত্তৰ দিব পাৰিব।"
                            : "Office hours are 10:00 AM to 6:00 PM. Formal team review is done tomorrow (or Monday); personal replies available now."}
                        </p>
                      </div>
                    </div>
                    
                    {/* Sunday Mode Toggle Button */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleToggleSundayNotice()}
                        className={`px-3 py-1 text-xs font-black rounded-lg border transition shadow-2xs cursor-pointer flex items-center gap-1.5 ${
                          whatsAppModalData.isSundayNotice
                            ? 'bg-rose-600 text-white border-rose-600 ring-2 ring-rose-400/30'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                        }`}
                        title="Click to toggle Sunday / Weekend Weekly Off notice mode"
                      >
                        <span>📅</span>
                        <span>
                          {whatsAppModalData.isSundayNotice
                            ? (whatsAppModalData.language === 'as' ? "দেওবাৰ বন্ধ সক্ৰিয় (Sunday Off: ON)" : "Sunday Notice: Active")
                            : (whatsAppModalData.language === 'as' ? "দেওবাৰৰ জাননী সক্ৰিয় কৰক" : "Set as Sunday")}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px] font-medium text-amber-950">
                    <div className="bg-white/90 border border-amber-200/90 rounded-xl p-2.5 flex items-start gap-2 shadow-2xs">
                      <span className="text-amber-600 font-bold text-xs mt-0.5">⏰</span>
                      <div>
                        <strong className="block text-slate-900">Work Hours: 10 AM – 6 PM</strong>
                        <span className="text-[10px] text-slate-600">Review team is active Monday–Saturday during these hours.</span>
                      </div>
                    </div>
                    <div className="bg-white/90 border border-amber-200/90 rounded-xl p-2.5 flex items-start gap-2 shadow-2xs">
                      <span className="text-indigo-600 font-bold text-xs mt-0.5">☀️</span>
                      <div>
                        <strong className="block text-slate-900">
                          {whatsAppModalData.isSundayNotice ? "Sunday Off (Feedback Monday)" : "Feedback Tomorrow"}
                        </strong>
                        <span className="text-[10px] text-slate-600">
                          {whatsAppModalData.isSundayNotice ? "Review team is off on Sunday; video reviewed on Monday." : "Team feedback provided tomorrow morning."}
                        </span>
                      </div>
                    </div>
                    <div className="bg-white/90 border border-amber-200/90 rounded-xl p-2.5 flex items-start gap-2 shadow-2xs">
                      <span className="text-emerald-600 font-bold text-xs mt-0.5">💬</span>
                      <div>
                        <strong className="block text-slate-900">Personal Reply Available</strong>
                        <span className="text-[10px] text-slate-600">You can personally reply & chat now, but final sign-off is tomorrow.</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Video Upload Reminder Banner */}
              {whatsAppModalData.selectedTemplate === 'video_upload_reminder' && ("""

assert repl5_old in content, 'repl5_old not found'
content = content.replace(repl5_old, repl5_new, 1)

with open('src/components/VideoCampaignDashboard.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('SUCCESS')
