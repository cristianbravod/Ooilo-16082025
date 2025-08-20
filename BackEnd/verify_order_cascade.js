const assert = require('assert');

// Helper function to make API requests
async function apiRequest(path, options = {}) {
    const url = `http://localhost:3000/api${path}`;
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
        },
    };
    const response = await fetch(url, { ...defaultOptions, ...options });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed with status ${response.status}: ${errorText}`);
    }
    return response.json();
}

// Main test function
async function runVerification() {
    console.log('--- Starting Backend Verification ---');

    let orderId;

    try {
        // 1. Create a new order with 3 pending items
        console.log('Step 1: Creating a new test order...');
        const newOrderPayload = {
            mesa: "Test-123",
            items: [
                { menu_item_id: 1, cantidad: 2, precio: 10.00 }, // Assuming item with ID 1 exists
                { menu_item_id: 2, cantidad: 1, precio: 5.50 },  // Assuming item with ID 2 exists
                { menu_item_id: 3, cantidad: 1, precio: 8.00 },  // Assuming item with ID 3 exists
            ],
            total: 33.50,
            notas: 'Test order for status cascade verification'
        };

        const createResponse = await apiRequest('/ordenes', {
            method: 'POST',
            body: JSON.stringify(newOrderPayload),
        });

        assert(createResponse.success, 'Order creation failed');
        assert(createResponse.resumen.numero_orden, 'Order ID not returned from creation');
        orderId = createResponse.resumen.numero_orden;
        console.log(`✅ Order created successfully with ID: ${orderId}`);


        // 2. Update the order status to 'preparando'
        console.log(`\nStep 2: Updating order ${orderId} status to 'preparando'...`);
        const updateResponse = await apiRequest(`/ordenes/${orderId}/estado`, {
            method: 'PATCH',
            body: JSON.stringify({ estado: 'preparando' }),
        });

        assert(updateResponse.success, 'Update order status failed');
        console.log(`✅ Order status updated via API.`);


        // 3. Fetch the order again to verify the cascade
        console.log(`\nStep 3: Fetching order ${orderId} to verify item statuses...`);
        const verifyResponse = await apiRequest(`/ordenes/${orderId}`);

        assert(verifyResponse.success, 'Failed to fetch order for verification');
        const updatedOrder = verifyResponse.data;

        // 4. Assertions
        console.log('\nStep 4: Running assertions...');

        // Check order status
        assert.strictEqual(updatedOrder.estado, 'preparando', `Order status should be 'preparando', but was '${updatedOrder.estado}'`);
        console.log('  -> OK: Order status is "preparando".');

        // Check that all items are now 'preparando'
        assert(updatedOrder.items && updatedOrder.items.length > 0, 'Order has no items after verification fetch');
        const allItemsPreparing = updatedOrder.items.every(item => item.estado === 'preparando');

        updatedOrder.items.forEach((item, index) => {
             assert.strictEqual(item.estado, 'preparando', `Item ${index} status should be 'preparando', but was '${item.estado}'`);
        });

        assert(allItemsPreparing, 'Not all items were updated to "preparando"');
        console.log('  -> OK: All item statuses are "preparando".');

        console.log('\n--- ✅ Backend Verification Successful! ---');

    } catch (error) {
        console.error('\n--- ❌ Backend Verification Failed! ---');
        console.error(error);
        process.exit(1); // Exit with error code
    }
}

// Run the test after a short delay to allow the server to start
setTimeout(runVerification, 3000);
