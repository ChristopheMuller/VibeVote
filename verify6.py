from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={'width': 1280, 'height': 1200}
        )
        page = context.new_page()

        # Mock API responses
        page.route("**/api/me", lambda route: route.fulfill(
            status=200,
            json={
                "id": "mock_user_id",
                "display_name": "Mock User",
                "images": [{"url": "https://i.scdn.co/image/ab6761610000e5eb55d39ab9c21d506aa52f7021"}]
            }
        ))

        page.route("**/api/playlists", lambda route: route.fulfill(
            status=200,
            json=[{
                "id": "mock_playlist_1",
                "name": "Mock Playlist",
                "images": [{"url": "https://i.scdn.co/image/ab67616d0000b273b46f74097655d7f353caab14"}],
                "tracks": {"total": 50}
            }]
        ))

        page.goto("http://localhost:3000/")

        # Wait for "Create Session"
        page.wait_for_selector("text=Create Session", timeout=10000)
        page.click("text=Create Session")

        # We should be on HostDashboard now. Click on the mocked playlist.
        page.wait_for_selector("text=Mock Playlist", timeout=10000)
        page.click("text=Mock Playlist")

        # Now we see the Session Options screen.
        page.wait_for_selector("text=Session Options", timeout=10000)

        page.click("text=Advanced Settings")

        # Wait longer for animation
        page.wait_for_timeout(2000)

        page.screenshot(path="./host5_after_advanced.png", full_page=True)

        browser.close()

run()
