import React, { useEffect, useRef } from "react";
import { Modal, Pressable, SafeAreaView, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { portalSession, portalCaptureScript } from "./portal-session";
const portal = "https://eservices.rs.ge";
export function DevicePortalView() {
  const job = portalSession((s) => s.job);
  const web = useRef<WebView>(null);
  const submitted = useRef(false),
    verified = useRef(false),
    finishing = useRef(false);
  useEffect(() => {
    submitted.current = false;
    verified.current = false;
    finishing.current = false;
  }, [job?.id]);
  if (!job) return null;
  const finish = (body?: unknown, error?: string) => {
    if (finishing.current) return;
    finishing.current = true;
    web.current?.injectJavaScript(
      "if(typeof handleLogout==='function')handleLogout();else location.href='https://eservices.rs.ge/MainPage.aspx';true;",
    );
    setTimeout(
      () => (error ? job.reject(new Error(error)) : job.resolve(body)),
      1600,
    );
  };
  const capture = portalCaptureScript(job.id);
  return (
    <Modal
      visible
      animationType="slide"
      onRequestClose={() => finish(undefined, "RS_PORTAL_LOGIN_REQUIRED")}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: "white" }}>
        <View
          style={{
            padding: 16,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: "600", color: "#111" }}>
              RS-თან დაკავშირება
            </Text>
            <Text style={{ fontSize: 13, color: "#555", marginTop: 4 }}>
              საჭიროებისას შეიყვანეთ SMS კოდი ან CAPTCHA.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => finish(undefined, "RS_PORTAL_LOGIN_REQUIRED")}
            style={{ padding: 12 }}
          >
            <Text style={{ color: "#1266cc" }}>დახურვა</Text>
          </Pressable>
        </View>
        <WebView
          key={job.id}
          ref={web}
          source={{ uri: portal + "/Login.aspx" }}
          incognito
          sharedCookiesEnabled={false}
          thirdPartyCookiesEnabled={false}
          javaScriptCanOpenWindowsAutomatically={false}
          setSupportMultipleWindows={false}
          injectedJavaScriptBeforeContentLoaded={capture}
          injectedJavaScriptBeforeContentLoadedForMainFrameOnly={false}
          injectedJavaScriptForMainFrameOnly={false}
          injectedJavaScript={capture}
          onShouldStartLoadWithRequest={(nav) => {
            try {
              const u = new URL(nav.url);
              return (
                nav.url === "about:blank" ||
                (u.protocol === "https:" &&
                  (u.hostname === "rs.ge" || u.hostname.endsWith(".rs.ge")))
              );
            } catch {
              return false;
            }
          }}
          onError={() => finish(undefined, "RS_PORTAL_UNAVAILABLE")}
          onHttpError={(e) => {
            if (e.nativeEvent.statusCode >= 500)
              finish(undefined, "RS_PORTAL_UNAVAILABLE");
          }}
          onNavigationStateChange={(nav) => {
            if (nav.loading) return;
            if (finishing.current) {
              web.current?.injectJavaScript(
                "if(typeof handleLogout==='function')handleLogout();true;",
              );
              return;
            }
            let url: URL;
            try {
              url = new URL(nav.url);
            } catch {
              return;
            }
            if (url.origin !== portal) return;
            if (url.pathname === "/Login.aspx" && !submitted.current) {
              submitted.current = true;
              web.current?.injectJavaScript(
                `(function(){var u=document.querySelector('#authorization input[type="text"]'),p=document.querySelector('#authorization input[type="password"]'),b=document.querySelector('#btnLogin');if(!u||!p||!b)return;function set(e,v){e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}set(u,${JSON.stringify(job.username)});set(p,${JSON.stringify(job.password)});b.click();})();true;`,
              );
            }
            if (url.pathname === "/MainPage.aspx" && !verified.current) {
              web.current?.injectJavaScript(
                `(function(){var tries=0;var t=setInterval(function(){var text=document.body?document.body.innerText:'';var ok=new RegExp('(^|[^0-9])'+${JSON.stringify(job.taxpayerId)}+'([^0-9]|$)').test(text);if(ok||++tries>=10){clearInterval(t);window.ReactNativeWebView.postMessage(JSON.stringify({nonce:${JSON.stringify(job.id)},kind:'identity',ok:ok}));}},500);})();true;`,
              );
            }
          }}
          onMessage={(event) => {
            if (finishing.current || event.nativeEvent.data.length > 2100000)
              return;
            try {
              if (new URL(event.nativeEvent.url).origin !== portal) return;
              const message = JSON.parse(event.nativeEvent.data);
              if (message.nonce !== job.id) return;
              if (message.kind === "identity" && !verified.current) {
                if (!message.ok)
                  return finish(undefined, "RS_PORTAL_ID_MISMATCH");
                verified.current = true;
                const target =
                  job.kind === "debt"
                    ? "/Accounting.aspx"
                    : "/app/Notifications";
                web.current?.injectJavaScript(
                  `location.href=${JSON.stringify(portal)}+${JSON.stringify(target)};true;`,
                );
              } else if (verified.current && message.kind === job.kind)
                finish(message.body);
            } catch {
              finish(undefined, "RS_PORTAL_FORMAT_CHANGED");
            }
          }}
          style={{ flex: 1 }}
        />
      </SafeAreaView>
    </Modal>
  );
}
