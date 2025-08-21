import asyncio
from playwright.async_api import async_playwright, expect
import os
import re

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        file_path = '/app/BackEnd/public/Front/adminweb.html'

        # --- Mock API routes ---
        await page.route("**/api/auth/login", lambda route: route.fulfill(
            status=200,
            json={"success": True, "token": "fake-admin-token", "user": {"nombre": "Admin User", "rol": "admin"}}
        ))

        initial_order_state = {
            "id": 1, "mesa": "Mesa Optimistic", "estado": "pendiente", "fecha_creacion": "2025-08-20T15:00:00.000Z",
            "items": [
                {"id": 10, "nombre": "Item A", "estado": "pendiente"},
                {"id": 11, "nombre": "Item B", "estado": "pendiente"}
            ]
        }
        await page.route("**/api/ordenes/activas", lambda route: route.fulfill(
            status=200, json=[initial_order_state]
        ))

        # Mock the PATCH request with a 3-second delay
        updated_order_state = {
            "id": 1, "mesa": "Mesa Optimistic", "estado": "preparando", "fecha_creacion": "2025-08-20T15:00:00.000Z",
            "items": [
                {"id": 10, "nombre": "Item A", "estado": "preparando"},
                {"id": 11, "nombre": "Item B", "estado": "preparando"}
            ]
        }

        async def handle_patch(route):
            print("API: PATCH request received. Waiting 3 seconds to respond...")
            await asyncio.sleep(3)
            await route.fulfill(
                status=200,
                json={"success": True, "message": "Orden actualizada", "data": updated_order_state}
            )
            print("API: Responded to PATCH request.")

        await page.route("**/api/ordenes/1/estado", handle_patch)

        # --- Test Execution ---
        print("Navigating to page...")
        await page.goto(f"file://{file_path}")

        print("Logging in...")
        await page.get_by_label("Email").fill("admin@restaurante.com")
        await page.get_by_label("Contraseña").fill("admin123")
        await page.get_by_role("button", name="Iniciar Sesión").click()
        await expect(page.locator("#app.authenticated")).to_be_visible()

        print("Verifying initial state...")
        await expect(page.locator(".order-card.pendiente")).to_be_visible()

        # Click the button. The UI should update instantly.
        print("Clicking 'Empezar Preparación'...")
        await page.get_by_role("button", name="Empezar Preparación").click(force=True)

        # Immediately check for the optimistic update
        print("Verifying optimistic UI update (before API responds)...")
        await expect(page.locator(".order-card.preparando")).to_be_visible()
        await expect(page.locator(".order-item.item-status-preparando")).to_have_count(2)
        print("  -> OK: UI updated instantly.")

        print("Taking screenshot of optimistic update...")
        await page.screenshot(path="jules-scratch/verification/optimistic_update.png")

        # The main verification is done. We'll add a small sleep to ensure the background API call can complete
        # without ending the script prematurely.
        await asyncio.sleep(4)

        await browser.close()
        print("Verification script finished successfully.")

asyncio.run(main())
