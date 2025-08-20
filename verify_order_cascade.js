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
    console.log('--- Starting Backend Verification for Bug Fix ---');

    let orderId;

    try {
        // 1. Create a new order
        console.log('Step 1: Creating a new test order...');
        const newOrderPayload = {
            mesa: "Test-BugFix",
            items: [
                { menu_item_id: 1, cantidad: 1, precio: 10.00 },
                { menu_item_id: 2, cantidad: 1, precio: 5.50 },
            ],
            total: 15.50,
            notas: 'Test order for bug fix verification'
        };

        const createResponse = await apiRequest('/ordenes', {
            method: 'POST',
            body: JSON.stringify(newOrderPayload),
        });

        assert(createResponse.success, 'Order creation failed');
        orderId = createResponse.resumen.numero_orden;
        console.log(`✅ Order created successfully with ID: ${orderId}`);


        // 2. Update the order status to 'preparando'
        console.log(`\nStep 2: Updating order ${orderId} status to 'preparando'...`);
        const updateResponse = await apiRequest(`/ordenes/${orderId}/estado`, {
            method: 'PATCH',
            body: JSON.stringify({ estado: 'preparando' }),
        });

        // 3. Assertions on the response of the PATCH request
        console.log('\nStep 3: Running assertions on the API response...');
        assert(updateResponse.success, 'Update order status API call failed');
        const updatedOrder = updateResponse.data;

        // Check order status in response
        assert.strictEqual(updatedOrder.estado, 'preparando', `Response: Order status should be 'preparando', but was '${updatedOrder.estado}'`);
        console.log('  -> OK: Response order status is "preparando".');

        // Check items in response
        assert(updatedOrder.items && updatedOrder.items.length === 2, 'Response: Order should have 2 items');
        const allItemsPreparingInResponse = updatedOrder.items.every(item => item.estado === 'preparando');
        assert(allItemsPreparingInResponse, 'Response: Not all items were updated to "preparando"');
        console.log('  -> OK: Response item statuses are all "preparando".');

        console.log('\n--- ✅ Backend Verification Successful! ---');

    } catch (error) {
        console.error('\n--- ❌ Backend Verification Failed! ---');
        console.error(error);
        process.exit(1); // Exit with error code
    }
}

// Run the test after a short delay
setTimeout(runVerification, 3000);
