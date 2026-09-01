package in.niatindia.brave;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

/**
 * Publishes the real window insets to CSS.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * The web layer already reserves room for the status bar and the gesture bar
 * with `env(safe-area-inset-top)` / `env(safe-area-inset-bottom)` — the app
 * header, the bottom navigation, the sign-in screen and several rules in
 * index.css all depend on it.
 *
 * On Android those values are ALWAYS ZERO. Android's WebView reports only
 * display cutouts through `env(safe-area-inset-*)`, never the system bars.
 * That was survivable while the WebView was laid out below the status bar,
 * because then there was nothing to reserve. It is not survivable now:
 *
 *   - `targetSdk` here is 36, and from Android 15 the system FORCES every app
 *     edge-to-edge. The WebView is drawn behind the status bar and behind the
 *     gesture bar whether we ask for it or not.
 *   - `StatusBar.setOverlaysWebView(false)`, which the web layer calls to opt
 *     out, is implemented with `SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN`. Those flags
 *     are deprecated no-ops on Android 15+. So is `setBackgroundColor`:
 *     the plugin's own `shouldSetStatusBarColor()` returns false outright for
 *     an app targeting 16.
 *
 * The result on a current phone is that the app header sits UNDER the clock
 * and battery icons, and the bottom navigation sits UNDER the gesture pill.
 *
 * ── WHAT THIS DOES ──────────────────────────────────────────────────────────
 *
 * Reads the insets Android actually reports and writes them onto <html> as
 * `--safe-area-inset-*` custom properties, in CSS pixels. index.css defines the
 * same four properties with `env(...)` fallbacks, so iOS and the browser keep
 * their existing behaviour untouched and only Android gains a real value.
 *
 * The insets are re-published on every page load: signing in navigates to the
 * NIAT SSO on another origin and back, which destroys the JS context that held
 * them.
 *
 * Deleting this class means the app renders under the system bars again. The
 * web layer needs no change — it is already written against these properties.
 */
public class MainActivity extends BridgeActivity {

    /** Last insets seen, so a page load can be re-served without waiting for a new event. */
    private String pendingInsetsJs = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        final WebView webView = getBridge().getWebView();
        if (webView == null) {
            return;
        }

        ViewCompat.setOnApplyWindowInsetsListener(
            webView,
            (view, windowInsets) -> {
                // System bars AND display cutout: a punch-hole or notch phone
                // needs both, and taking the union means neither is missed.
                Insets insets = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
                );

                // Android reports physical pixels; CSS wants CSS pixels.
                float density = getResources().getDisplayMetrics().density;
                if (density <= 0f) {
                    density = 1f;
                }

                pendingInsetsJs = buildInsetsJs(
                    insets.top / density,
                    insets.right / density,
                    insets.bottom / density,
                    insets.left / density
                );
                applyInsets(webView);

                // Returned unconsumed: other views, and Capacitor's own keyboard
                // handling, still need to see them.
                return windowInsets;
            }
        );

        // A page load replaces the document, taking the inline custom properties
        // with it. Sign-in does exactly that — out to forms.ccbp.in and back.
        getBridge()
            .addWebViewListener(
                new WebViewListener() {
                    @Override
                    public void onPageLoaded(WebView view) {
                        applyInsets(view);
                    }
                }
            );

        // Ask for insets now rather than waiting for the first system event,
        // so the first paint is already correct.
        ViewCompat.requestApplyInsets(webView);
    }

    private void applyInsets(final WebView webView) {
        final String js = pendingInsetsJs;
        if (js == null || webView == null) {
            return;
        }
        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    /**
     * Wrapped in try/catch on the JS side: this runs on every page load,
     * including ones that are mid-navigation, and a throw here would surface as
     * an unexplained console error rather than anything actionable.
     */
    private static String buildInsetsJs(float top, float right, float bottom, float left) {
        return String.format(
            java.util.Locale.US,
            "(function(){try{var s=document.documentElement.style;" +
            "s.setProperty('--safe-area-inset-top','%.2fpx');" +
            "s.setProperty('--safe-area-inset-right','%.2fpx');" +
            "s.setProperty('--safe-area-inset-bottom','%.2fpx');" +
            "s.setProperty('--safe-area-inset-left','%.2fpx');" +
            "}catch(e){}})();",
            top,
            right,
            bottom,
            left
        );
    }
}
