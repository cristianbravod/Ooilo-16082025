from playwright.sync_api import sync_playwright, expect
import os

def run_verification():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Construct the file path to adminweb.html
        # The script is in jules-scratch/verification, so we need to go up two levels
        # and then into BackEnd/public/Front
        file_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'BackEnd', 'public', 'Front', 'adminweb.html'))

        if not os.path.exists(file_path):
            print(f"Error: File not found at {file_path}")
            browser.close()
            return

        print(f"Navigating to file://{file_path}")
        page.goto(f"file://{file_path}")

        # Wait for the page to load and the tabs to be visible
        # We'll look for the "Informes" tab
        try:
            # First, check if the main container is visible
            expect(page.locator("#admin-panel")).to_be_visible(timeout=5000)

            # Now, look for the tab link itself
            report_tab_link = page.get_by_role("link", name="Informes")
            expect(report_tab_link).to_be_visible()
            print("✅ 'Informes' tab link is visible.")

            # Click the tab to make sure the content is there
            report_tab_link.click()

            # Check for a unique element within the reports tab content
            report_content = page.locator("#report-content")
            expect(report_content).to_be_visible()
            print("✅ 'Informes' tab content is visible after click.")

            # Check for the title inside the report content
            title = page.get_by_role("heading", name="Panel de Informes y Analíticas")
            expect(title).to_be_visible()
            print("✅ Report panel title is correct.")

        except Exception as e:
            print(f"❌ Verification failed: {e}")
            # Take a screenshot even on failure for debugging
            page.screenshot(path="jules-scratch/verification/verification_error.png")
            browser.close()
            raise

        # Take a screenshot of the reports tab
        screenshot_path = "jules-scratch/verification/verification.png"
        page.screenshot(path=screenshot_path)
        print(f"📸 Screenshot captured at {screenshot_path}")

        browser.close()

if __name__ == "__main__":
    run_verification()
