import { describe,it,expect,vi,afterEach } from "vitest";
import { advertisingPermitted,leadEventId,viewSchema,leadSchema } from "@/lib/landing-tracking";
import { sendMetaLead } from "@/lib/meta-capi";
afterEach(()=>vi.unstubAllGlobals());
describe("rastreamento da LP",()=> {
 it("preserva fbclid de 260 caracteres sem cortar a atribuição",()=>{
   const fbclid="A".repeat(260);
   expect(viewSchema.parse({slug:"trafegofb",sessionId:"08706e1c-6651-4c04-bc1a-896a51e1639a",fbclid}).fbclid).toBe(fbclid);
 });
 it("usa o mesmo ID para Lead no navegador, servidor e tentativas",()=>{
   expect(leadEventId("ABC123")).toBe("lp_lead_ABC123");
   expect(leadEventId("ABC123")).toBe(leadEventId("ABC123"));
 });
 it("aceita fbc completo sem converter o identificador opaco",()=>{
   const fbc="fb.1.1795741520326."+"B".repeat(260);
   expect(leadSchema.parse({slug:"trafegofb",ref:"ABC123",fbc}).fbc).toBe(fbc);
 });
 it("não envia publicidade sem permissão em região obrigatória ou desconhecida",()=>{
   expect(advertisingPermitted(null,"DE",false)).toBe(false);
   expect(advertisingPermitted(null,null,false)).toBe(false);
   expect(advertisingPermitted(null,"XX",false)).toBe(false);
 });
 it("recusa e sinal de privacidade vencem aceitação ou região brasileira",()=>{
   expect(advertisingPermitted("denied","BR",false)).toBe(false);
   expect(advertisingPermitted("granted","BR",true)).toBe(false);
 });
 it("permite publicidade comum no Brasil e aceitação explícita onde necessária",()=>{
   expect(advertisingPermitted(null,"BR",false)).toBe(true);
   expect(advertisingPermitted("granted","DE",false)).toBe(true);
 });
 it("HTTP 200 sem events_received não confirma entrega",async()=>{
   vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({events_received:0})));
   expect((await sendMetaLead("123","test-owned-token",{eventId:"lp_lead_ABC123",sourceUrl:"https://example.test/lp"})).ok).toBe(false);
 });
 it("registra recebimento confirmado e mantém token fora da URL",async()=>{
   const fetchMock=vi.fn().mockResolvedValue(Response.json({events_received:1}));vi.stubGlobal("fetch",fetchMock);
   expect(await sendMetaLead("123","test-owned-token",{eventId:"lp_lead_ABC123",sourceUrl:"https://example.test/lp",eventTime:1700000000})).toEqual({ok:true,error:null});
   expect(fetchMock.mock.calls[0]?.[0]).toBe("https://graph.facebook.com/v26.0/123/events");
 });
});
