package in.niatindia.brave;

import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebView webView = getBridge().getWebView();
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        // Forms occasionally serves a reduced experience to user agents marked
        // as an embedded "wv". Keep Android's current Chrome version while
        // presenting this trusted NIAT-owned WebView as ordinary mobile Chrome.
        String userAgent = settings.getUserAgentString();
        settings.setUserAgentString(userAgent.replace("; wv", ""));

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);
    }

    @Override
    public void onPause() {
        CookieManager.getInstance().flush();
        super.onPause();
    }
}
