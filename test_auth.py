from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        page.goto("http://localhost:3000")
        page.wait_for_timeout(2000)
        page.screenshot(path="auth_screen.png")
        print("Screenshot saved to auth_screen.png")

        browser.close()

if __name__ == "__main__":
    run()
