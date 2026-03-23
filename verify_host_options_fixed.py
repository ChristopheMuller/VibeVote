from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # Mock /api/me
        page.route("**/api/me", lambda route: route.fulfill(
            status=200,
            json={"display_name": "Test User", "id": "test_user"}
        ))

        # Mock /api/playlists
        page.route("**/api/playlists", lambda route: route.fulfill(
            status=200,
            json=[{
                "id": "playlist_1",
                "name": "Test Playlist",
                "images": [{"url": "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&h=300&fit=crop"}]
            }]
        ))

        # Mock /api/health
        page.route("**/api/health", lambda route: route.fulfill(status=200, json={"status": "ok"}))

        # Mock Firebase API calls or token checking if needed
        # We also need to set the dummy token in localStorage so we appear logged in
        page.goto("http://localhost:3000")
        page.evaluate("localStorage.setItem('spotify_token', 'dummy_token');")
        page.reload()

        # Wait for the playlist to appear and click it
        page.get_by_text("Test Playlist").wait_for(timeout=5000)
        page.get_by_text("Test Playlist").click()

        # Now wait for the Host Options screen to appear
        page.get_by_text("Host Options").wait_for(timeout=5000)

        # Take a screenshot
        page.screenshot(path="host_options_success.png")
        print("Screenshot saved to host_options_success.png")

        browser.close()

if __name__ == "__main__":
    run()
