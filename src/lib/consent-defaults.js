window.consentAskEverywhere = false;
window.dataLayer = window.dataLayer || [];
function gtag() {
  dataLayer.push(arguments);
}
var outsideConsentRegions = window.consentAskEverywhere === true ? "denied" : "granted";
gtag("consent", "default", {
  analytics_storage: outsideConsentRegions,
  ad_storage: outsideConsentRegions,
  ad_user_data: outsideConsentRegions,
  ad_personalization: outsideConsentRegions,
});
gtag("consent", "default", {
  analytics_storage: "denied",
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
  wait_for_update: 500,
  region:
    "AT,BE,BG,HR,CY,CZ,DK,EE,FI,FR,DE,GR,HU,IE,IT,LV,LT,LU,MT,NL,PL,PT,RO,SK,SI,ES,SE,IS,LI,NO,GB,CH,RE,GP,MQ,GF,YT,MF,AX,CA-QC".split(
      ",",
    ),
});
(function () {
  var signals = {
    analytics: ["analytics_storage"],
    advertising: ["ad_storage", "ad_user_data", "ad_personalization"],
  };
  for (var purpose in signals) {
    var choice = null;
    try {
      var saved = JSON.parse(localStorage.getItem("cookie_consent_" + purpose) || "null");
      if (
        saved &&
        (saved.choice === "denied" || (saved.choice === "granted" && Date.now() - saved.at < 365 * 86400000))
      ) {
        choice = saved.choice;
      }
    } catch (e) {}
    if (navigator.globalPrivacyControl === true) choice = "denied";
    if (!choice) continue;
    var update = {};
    signals[purpose].forEach(function (signal) {
      update[signal] = choice;
    });
    gtag("consent", "update", update);
  }
})();
