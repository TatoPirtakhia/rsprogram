import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Platform, View } from "react-native";
import { WebView, type WebViewNavigation } from "react-native-webview";
import { BackLink, Button, Txt } from "../../components/ui";
import { Sheet } from "../../components/settings-drawer";
import { useTheme } from "../../theme";
import { post } from "../../services/api";
const portal = "https://eservices.rs.ge";
export const payUrl = `${portal}/PayDecl.aspx?type=2`;
// Sub-user accounts are redirected away from PayDecl; the accounting debt
// tab has the same amount and its own "გადახდა" button.
const fallbackUrl = `${portal}/Accounting.aspx`;
type Stage = "login" | "target" | "fallback" | "ready" | "manual";
// Portal pages open payment providers with window.open; keep them in this view.
const sameWindow =
  "window.open=function(u){if(u)location.href=u;return null;};true;";
function loginScript(username: string, password: string) {
  return `(function(){
    var u=document.querySelector('#authorization input[type="text"]');
    var p=document.querySelector('#authorization input[type="password"]');
    var b=document.querySelector('#btnLogin');
    if(!u||!p||!b)return;
    function set(el,v){el.focus();el.value=v;
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new Event('change',{bubbles:true}));}
    set(u,${JSON.stringify(username)});set(p,${JSON.stringify(password)});
    b.click();
  })();true;`;
}
const path = (url: string) => {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
};
// Sheet with an in-app browser that signs into the RS portal with the
// profile's saved credentials and then opens the payment page. The session
// is private to this sheet and is signed out when the sheet closes.
export function PortalBrowser({
  uid,
  username,
  open,
  onClose,
  target = payUrl,
}: {
  uid: string;
  username: string;
  open: boolean;
  onClose: () => void;
  target?: string;
}) {
  const c = useTheme();
  const web = useRef<WebView>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("login");
  const [message, setMessage] = useState("");
  const [canGoBack, setCanGoBack] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const submitted = useRef(false);
  const signedIn = useRef(false);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setStage("login");
    setMessage("");
    setPassword(null);
    submitted.current = false;
    signedIn.current = false;
    void post<{ password: string }>(`/local/profiles/${uid}/password`)
      .then((value) => active && setPassword(value.password))
      .catch(() => {
        if (!active) return;
        setStage("manual");
        setMessage("შენახული პაროლი ვერ ჩაიტვირთა. შედით ხელით.");
        setPassword("");
      });
    return () => {
      active = false;
    };
  }, [open, uid, attempt]);
  // RS sometimes never answers a login; let the user take over.
  useEffect(() => {
    if (stage === "ready" || stage === "manual" || !open) return;
    const timer = setTimeout(() => {
      setStage("manual");
      setMessage(
        "RS დიდხანს პასუხობს. დაასრულეთ ავტორიზაცია ხელით ან სცადეთ თავიდან.",
      );
    }, 60000);
    return () => clearTimeout(timer);
  }, [stage, open, attempt]);
  const requestedAt = useRef(0);
  const go = (url: string) => {
    requestedAt.current = Date.now();
    web.current?.injectJavaScript(`location.href=${JSON.stringify(url)};true;`);
  };
  const onNavigation = (nav: WebViewNavigation) => {
    setCanGoBack(nav.canGoBack);
    if (nav.loading) return;
    const at = path(nav.url);
    if (at === "/MainPage.aspx") signedIn.current = true;
    if (stage === "login") {
      if (at === "/Login.aspx" && password && !submitted.current) {
        submitted.current = true;
        web.current?.injectJavaScript(loginScript(username, password));
      } else if (at === "/Login.aspx" && submitted.current) {
        setStage("manual");
        setMessage(
          "ავტორიზაცია ვერ დასრულდა. შესაძლოა SMS კოდია საჭირო — დაასრულეთ ხელით.",
        );
      } else if (at === "/MainPage.aspx") {
        setStage("target");
        go(target);
      }
    } else if (stage === "target") {
      if (at === path(target)) setStage("ready");
      // A MainPage event right after the request is the login page settling,
      // not RS redirecting away from the target.
      else if (
        at === "/MainPage.aspx" &&
        Date.now() - requestedAt.current > 500
      ) {
        setStage("fallback");
        go(fallbackUrl);
      }
    } else if (stage === "fallback" && at === path(fallbackUrl)) {
      setStage("ready");
      setMessage(
        "გადახდის გვერდი ამ ანგარიშისთვის მიუწვდომელია. გადაიხადეთ „გადახდა“ ღილაკით.",
      );
    }
  };
  const close = () => {
    if (!signedIn.current) return onClose();
    // Leaving the portal session open makes later logins stall.
    web.current?.injectJavaScript(
      "if(typeof handleLogout==='function')handleLogout();true;",
    );
    setTimeout(onClose, 1200);
  };
  const loading =
    stage === "login" || stage === "target" || stage === "fallback";
  return (
    <Sheet
      open={open}
      onClose={close}
      title="გადახდა"
      fill
      leading={
        canGoBack && !loading ? (
          <BackLink title="უკან" onPress={() => web.current?.goBack()} />
        ) : undefined
      }
    >
      {Platform.OS === "web" ? (
        <View style={{ padding: 16, gap: 12 }}>
          <Txt muted>
            ვებ ვერსიაში ავტომატური ავტორიზაცია ვერ ხერხდება. გახსენით RS
            კაბინეტი ახალ ფანჯარაში.
          </Txt>
          <Button
            title="RS კაბინეტის გახსნა ↗"
            onPress={() => void Linking.openURL(target)}
          />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {!!message && (
            <View style={{ padding: 12, backgroundColor: c.card }}>
              <Txt size={13} color={stage === "manual" ? c.warning : c.muted}>
                {message}
              </Txt>
              {stage === "manual" && (
                <Button
                  quiet
                  title="თავიდან ცდა"
                  onPress={() => setAttempt((n) => n + 1)}
                />
              )}
            </View>
          )}
          {password !== null && (
            <WebView
              key={attempt}
              ref={web}
              source={{ uri: `${portal}/Login.aspx` }}
              incognito
              sharedCookiesEnabled={false}
              javaScriptCanOpenWindowsAutomatically={false}
              setSupportMultipleWindows={false}
              injectedJavaScriptBeforeContentLoaded={sameWindow}
              onNavigationStateChange={onNavigation}
              style={{ flex: 1, backgroundColor: c.bg }}
            />
          )}
          {loading && (
            <View
              style={{
                position: "absolute",
                inset: 0,
                top: message ? 80 : 0,
                backgroundColor: c.bg,
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
              }}
            >
              <ActivityIndicator color={c.muted} />
              <Txt muted>
                {stage === "login"
                  ? "RS-ში ავტორიზაცია…"
                  : "გადახდის გვერდი იხსნება…"}
              </Txt>
            </View>
          )}
        </View>
      )}
    </Sheet>
  );
}
