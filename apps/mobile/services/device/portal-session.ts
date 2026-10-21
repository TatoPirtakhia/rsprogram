import { create } from "zustand";
import * as Crypto from "expo-crypto";
export interface PortalJob {
  id: string;
  username: string;
  password: string;
  taxpayerId: string;
  kind: "debt" | "inbox";
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}
export const portalSession = create<{ job: PortalJob | null }>(() => ({
  job: null,
}));
let queue = Promise.resolve();
export function readPortal(
  credentials: { username: string; password: string },
  taxpayerId: string,
  kind: PortalJob["kind"],
): Promise<unknown> {
  const run = queue.then(
    () =>
      new Promise<unknown>((resolve, reject) => {
        const id = Crypto.randomUUID();
        const timeout = setTimeout(
          () => finish(undefined, new Error("RS_PORTAL_UNAVAILABLE")),
          120000,
        );
        const finish = (value?: unknown, error?: Error) => {
          clearTimeout(timeout);
          if (portalSession.getState().job?.id !== id) return;
          portalSession.setState({ job: null });
          if (error) reject(error);
          else resolve(value);
        };
        portalSession.setState({
          job: {
            ...credentials,
            taxpayerId,
            kind,
            id,
            resolve: (value) => finish(value),
            reject: (error) => finish(undefined, error),
          },
        });
      }),
  );
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
export const portalCaptureScript = (nonce: string) => `
(function(){
 if(location.origin!=='https://eservices.rs.ge')return;
 if(window.__rsCapture)return;window.__rsCapture=true;
 function capture(url,text){try{
  var u=new URL(url,location.href);
  var debt=u.origin==='https://eservices.rs.ge'&&u.pathname==='/WebServices/hsAccounting.ashx/GetBudgetAccountingInfo';
  var inbox=u.origin==='https://eapi.rs.ge'&&u.pathname==='/Notifications/GrdNotifications';
  if((debt||inbox)&&typeof text==='string'&&text.length<=2000000)
   window.ReactNativeWebView.postMessage(JSON.stringify({nonce:${JSON.stringify(nonce)},kind:debt?'debt':'inbox',body:JSON.parse(text)}));
 }catch(e){}}
 var open=XMLHttpRequest.prototype.open,send=XMLHttpRequest.prototype.send;
 XMLHttpRequest.prototype.open=function(method,url){this.__rsURL=url;return open.apply(this,arguments);};
 XMLHttpRequest.prototype.send=function(){this.addEventListener('load',function(){if(this.status>=200&&this.status<300)capture(this.__rsURL,this.responseType==='json'?JSON.stringify(this.response):this.responseText);});return send.apply(this,arguments);};
 var original=window.fetch;
 window.fetch=function(){var args=arguments;return original.apply(this,args).then(function(r){if(r.ok)r.clone().text().then(function(t){capture(r.url,t);}).catch(function(){});return r;});};
})();true;`;
