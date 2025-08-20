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
        # Mock login
        await page.route("**/api/auth/login", lambda route: route.fulfill(
            status=200,
            json={"success": True, "token": "fake-admin-token", "user": {"nombre": "Admin User", "rol": "admin"}}
        ))

        # Mock initial GET for active orders (returns one 'pendiente' order)
        initial_order_state = {
            "id": 1, "mesa": "Mesa BugFix", "estado": "pendiente", "fecha_creacion": "2025-08-20T14:00:00.000Z",
            "items": [
                {"id": 10, "nombre": "Item A", "estado": "pendiente"},
                {"id": 11, "nombre": "Item B", "estado": "pendiente"}
            ]
        }
        await page.route("**/api/ordenes/activas", lambda route: route.fulfill(
            status=200, json=[initial_order_state]
        ))

        # Mock the PATCH request for updating the order status
        # This mock will return the FULLY UPDATED order, as the backend now does
        updated_order_state = {
            "id": 1, "mesa": "Mesa BugFix", "estado": "preparando", "fecha_creacion": "2025-08-20T14:00:00.000Z",
            "items": [
                {"id": 10, "nombre": "Item A", "estado": "preparando"},
                {"id": 11, "nombre": "Item B", "estado": "preparando"}
            ]
        }
        await page.route("**/api/ordenes/1/estado", lambda route: route.fulfill(
            status=200,
            json={"success": True, "message": "Orden actualizada", "data": updated_order_state}
        ))

        # --- Test Execution ---
        print("Navigating to page...")
        await page.goto(f"file://{file_path}")

        # Login
        print("Logging in...")
        await page.get_by_label("Email").fill("admin@restaurante.com")
        await page.get_by_label("Contraseña").fill("admin123")
        await page.get_by_role("button", name="Iniciar Sesión").click()
        await expect(page.locator("#app.authenticated")).to_be_visible()

        # Verify initial state
        print("Verifying initial state...")
        await expect(page.locator(".order-card.pendiente")).to_be_visible()
        await expect(page.locator(".order-item.item-status-pendiente")).to_have_count(2)

        # Click the button to update the order status
        print("Clicking 'Empezar Preparación'...")
        await page.get_by_role("button", name="Empezar Preparación").click(force=True)

        # Verify final state (instant update)
        print("Verifying instant update...")
        await expect(page.locator(".order-card.preparando")).to_be_visible()
        await expect(page.locator(".order-item.item-status-preparando")).to_have_count(2)
        await expect(page.get_by_role("button", name="Marcar como Lista")).to_be_visible()

        print("Frontend update verified. Taking screenshot...")
        await page.screenshot(path="jules-scratch/verification/frontend_bug_fix.png")

        await browser.close()
        print("Verification script finished successfully.")

asyncio.run(main())
