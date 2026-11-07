// Link-preview and search crawlers fetch a link when it is pasted in WhatsApp/Facebook/etc. They are not customers,
// so they must not count as campaign clicks. In-app browsers of real users (Instagram, FBAN/FBAV) are NOT matched.
const BOT_UA = /facebookexternalhit|facebot|meta-externalagent|meta-externalfetcher|whatsapp\/|twitterbot|telegrambot|slackbot|discordbot|linkedinbot|skypeuripreview|googlebot|adsbot-google|mediapartners-google|google-inspectiontool|bingbot|applebot|\bbot\b|crawler|spider/i;

export const isLinkPreviewBot = (ua: string | null | undefined): boolean => !!ua && BOT_UA.test(ua);
