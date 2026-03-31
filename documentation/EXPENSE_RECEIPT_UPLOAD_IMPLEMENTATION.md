# Receipt File Upload Implementation for Expenses

## Summary

The Create Expense feature has been enhanced to support receipt file uploads (images and PDFs). When users create an expense, they can now attach a receipt file which will be:
1. Stored in the file system
2. Saved as a receipt record in the database
3. Linked to the expense via a foreign key relationship

## Database Changes

### Migration File: `007_add_receipt_id_to_expenses.sql`

**Location:** `DB/007_add_receipt_id_to_expenses.sql`

**Changes:**
- Added `receipt_id` column to `account_expenses` table
- Created foreign key constraint linking to `receipt` table
- Added index for performance optimization

**To Apply Migration:**
```sql
-- Run this SQL in your database
ALTER TABLE `account_expenses` 
ADD COLUMN `receipt_id` INT DEFAULT NULL AFTER `expenses_receipt_no`,
ADD INDEX `idx_receipt_id` (`receipt_id`),
ADD CONSTRAINT `fk_expenses_receipt` 
    FOREIGN KEY (`receipt_id`) 
    REFERENCES `receipt` (`receipt_id`) 
    ON DELETE SET NULL;
```

## Code Changes

### 1. Updated ExpensesModel (`models/AppModel/Expenses/ExpensesModel.js`)

**Changes:**
- Imported `CreateReceipt` function from Receipt model
- Modified `createExpenseEnhanced` function to:
  - Accept `receipt_file_url` and `receipt_metadata` parameters
  - Create a receipt record before creating the expense
  - Link the receipt to the expense via `receipt_id`

**Key Code:**
```javascript
// Step 0: Create receipt record if file is uploaded
let receipt_id = null;
if (receipt_file_url) {
    const receiptData = {
        account_id: parseInt(account_id),
        receipt_name: expenses_merchant_name || 'Expense Receipt',
        receipt_description: `Receipt for ${expenses_merchant_name || 'expense'} on ${expenses_date}`,
        receipt_amount: parseFloat(expenses_total_amount),
        receipt_items: items && items.length > 0 ? JSON.stringify(items) : null,
        receipt_image_url: receipt_file_url,
        receipt_metadata: receipt_metadata ? JSON.stringify(receipt_metadata) : null,
        status: 'Active'
    };

    const receiptResult = await CreateReceipt(receiptData);
    if (receiptResult.status) {
        receipt_id = receiptResult.data;
    }
}
```

### 2. Updated CreateExpense Controller (`controllers/AppController/Expenses/CreateExpense.js`)

**Changes:**
- Added multer file upload middleware: `upload.single('receipt_file')`
- Imported `upload` and `getFileUrl` from `configs/fileUpload`
- Added file processing logic to handle uploaded receipts
- Enhanced item parsing to support JSON strings (multipart form data)
- Pass file URL and metadata to the model

**Key Features:**
- Accepts `receipt_file` as multipart form field
- Supports images (JPEG, PNG, GIF, WebP, HEIC) and PDFs
- Maximum file size: 15MB (configured in fileUpload.js)
- Generates public URL for the uploaded file
- Stores file metadata (original name, type, size, upload date)

## API Usage

### Endpoint
`POST /api/expenses/create`

### Content Type
`multipart/form-data`

### Request Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| expenses_date | string | Yes | Date in YYYY-MM-DD format |
| expenses_merchant_name | string | Yes | Merchant/vendor name |
| expenses_total_amount | number | Yes | Total expense amount |
| receipt_file | File | No | Receipt image or PDF file |
| expenses_merchant_id | string | No | Merchant unique identifier |
| expenses_receipt_no | string | No | Receipt number |
| expenses_tags | string | No | Tags for categorization |
| expenses_for | string | No | Self, Spouse, Child, Parent (default: Self) |
| dependant_id | integer | No | Dependant ID if applicable |
| items | string/array | No | JSON string or array of expense items |

### Example Request (using cURL)

```bash
curl -X POST https://yourdomain.com/api/expenses/create \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "expenses_date=2026-03-31" \
  -F "expenses_merchant_name=Popular Bookstore" \
  -F "expenses_total_amount=125.50" \
  -F "expenses_tags=books,education" \
  -F "receipt_file=@/path/to/receipt.jpg" \
  -F 'items=[{"item_name":"Textbook","item_unit_price":125.50,"item_quantity":1,"item_total_price":125.50}]'
```

### Example Request (using JavaScript/Fetch)

```javascript
const formData = new FormData();
formData.append('expenses_date', '2026-03-31');
formData.append('expenses_merchant_name', 'Popular Bookstore');
formData.append('expenses_total_amount', 125.50);
formData.append('expenses_tags', 'books,education');
formData.append('receipt_file', fileInput.files[0]); // File from input element

// Items as JSON string
const items = [
    {
        item_name: 'Textbook',
        item_unit_price: 125.50,
        item_quantity: 1,
        item_total_price: 125.50
    }
];
formData.append('items', JSON.stringify(items));

const response = await fetch('/api/expenses/create', {
    method: 'POST',
    headers: {
        'Authorization': 'Bearer ' + token
    },
    body: formData
});

const result = await response.json();
console.log(result);
```

### Success Response

```json
{
    "status_code": 201,
    "status": "success",
    "message": "Expense created successfully",
    "data": {
        "expense": {
            "expenses_id": 123,
            "expenses_date": "2026-03-31",
            "expenses_merchant_name": "Popular Bookstore",
            "expenses_total_amount": 125.50,
            "receipt_id": 456,
            "receipt_url": "https://yourdomain.com/asset/document/receipt-123456.jpg",
            "expenses_mapping_status": "Estimated",
            "expenses_mapping_confidence": 85.5,
            "tax_code": "P4",
            "tax_title": "Purchase of books",
            "items_count": 1,
            "categorization": {
                "tax_code": "P4",
                "tax_title": "Purchase of books",
                "confidence": 85.5,
                "matched_keywords": ["book", "education"]
            },
            "mapping_info": {
                "status": "Estimated",
                "version": "2026-preliminary",
                "is_official": false,
                "message": "Estimated category. Official 2026 LHDN mapping will be available in October."
            }
        },
        "ui_message": {
            "title": "⏳ Expense Saved (Estimated Category)",
            "description": "Estimated category. Official 2026 LHDN mapping will be available in October.",
            "badge": {
                "status": "Estimated",
                "color": "#f59e0b",
                "text": "Estimated"
            }
        }
    }
}
```

## File Storage

**Upload Directory:** `/asset/document/`

**File Naming:** `{sanitized_name}-{timestamp}-{random}.{ext}`

**Example:** `receipt-1711900234567-123456789.jpg`

**Supported Formats:**
- Images: JPEG, JPG, PNG, GIF, WebP, HEIC/HEIF
- Documents: PDF

**File Size Limit:** 15MB

## Database Schema

### receipt table (existing)
```sql
CREATE TABLE `receipt` (
  `receipt_id` int NOT NULL AUTO_INCREMENT,
  `receipt_name` varchar(256) DEFAULT NULL,
  `receipt_description` text,
  `receipt_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `receipt_items` json DEFAULT (_utf8mb4'[]'),
  `receipt_image_url` text NOT NULL,           -- File URL stored here
  `receipt_metadata` json DEFAULT NULL,         -- File metadata stored here
  `status` enum('Active','Inactive','Deleted','Others') NOT NULL DEFAULT 'Active',
  `created_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `account_id` int NOT NULL,
  `rc_id` int DEFAULT NULL,
  PRIMARY KEY (`receipt_id`),
  KEY `account_id` (`account_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### account_expenses table (updated)
```sql
CREATE TABLE `account_expenses` (
  `expenses_id` int NOT NULL AUTO_INCREMENT,
  -- ... other fields ...
  `expenses_receipt_no` varchar(256) DEFAULT NULL,
  `receipt_id` INT DEFAULT NULL,                -- NEW FIELD
  -- ... other fields ...
  KEY `idx_receipt_id` (`receipt_id`),          -- NEW INDEX
  CONSTRAINT `fk_expenses_receipt`              -- NEW FOREIGN KEY
    FOREIGN KEY (`receipt_id`) 
    REFERENCES `receipt` (`receipt_id`) 
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
```

## Testing

### Before Running
1. Apply the database migration: `007_add_receipt_id_to_expenses.sql`
2. Ensure the `/asset/document/` directory exists and is writable
3. Restart your Node.js server to load the updated code

### Test Scenarios

1. **Create expense without file**
   - Should work as before
   - receipt_id should be NULL

2. **Create expense with image file**
   - Upload a JPG/PNG file
   - Verify receipt record is created
   - Verify file is stored in `/asset/document/`
   - Verify expense has receipt_id set

3. **Create expense with PDF file**
   - Upload a PDF file
   - Same verification as above

4. **Create expense with items and file**
   - Include items array and file
   - Verify all data is saved correctly

5. **File size validation**
   - Try uploading a file > 15MB
   - Should receive error message

6. **File type validation**
   - Try uploading unsupported file type
   - Should receive error message

## Rollback

If you need to rollback this feature:

```sql
-- Remove foreign key constraint
ALTER TABLE `account_expenses` 
DROP FOREIGN KEY `fk_expenses_receipt`;

-- Remove index
ALTER TABLE `account_expenses` 
DROP INDEX `idx_receipt_id`;

-- Remove column
ALTER TABLE `account_expenses` 
DROP COLUMN `receipt_id`;
```

Then restore the backup files:
- `controllers/AppController/Expenses/CreateExpense.js.backup`

## Notes

- Receipt file upload is optional - API will work with or without files
- If receipt creation fails, expense will still be created (without receipt_id)
- Files are stored permanently unless manually deleted
- Receipt metadata is stored as JSON for future extensibility
- The foreign key uses `ON DELETE SET NULL` so deleting a receipt won't delete the expense

## Future Enhancements

1. **OCR Integration**: Extract data from receipt images automatically
2. **Receipt Compression**: Compress large images before storage
3. **Cloud Storage**: Move to S3/CloudStorage for scalability
4. **Receipt Preview**: Add receipt preview in expense details API
5. **Batch Upload**: Support multiple receipt files per expense
6. **File Validation**: More strict validation on file content (not just mimetype)

## Support

For issues or questions, contact the TaxLah Development Team.

**Updated:** March 31, 2026
