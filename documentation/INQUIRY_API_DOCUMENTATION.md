# Inquiry API Documentation

## Overview
The Inquiry API allows users to submit inquiries/contact forms and provides admin endpoints to manage them. The public endpoint does not require authentication, making it perfect for contact forms on your website or app.

---

## Database Schema

```sql
CREATE TABLE `inquiry` (
  `inquiry_id` int NOT NULL AUTO_INCREMENT,
  `inquiry_name` varchar(256) NOT NULL,
  `inquiry_email` varchar(100) DEFAULT NULL,
  `inquiry_subject` varchar(299) DEFAULT NULL,
  `inquiry_message` text,
  `inquiry_status` enum('Active','Pending','In-Progress','Completed','Rejected','Deleted','Others') NOT NULL DEFAULT 'Active',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_modified` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`inquiry_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

---

## Public Endpoints

### 1. Create Inquiry (Public - No Authentication Required)

**Endpoint:** `POST /api/public/inquiry`

**Description:** Submit a new inquiry. This endpoint is public and does not require authentication.

**Request Body:**
```json
{
  "inquiry_name": "John Doe",
  "inquiry_email": "john.doe@example.com",
  "inquiry_subject": "Question about subscription",
  "inquiry_message": "I would like to know more about your premium subscription plans."
}
```

**Required Fields:**
- `inquiry_name` (string) - Name of the person submitting the inquiry
- `inquiry_email` (string) - Valid email address
- `inquiry_message` (string) - Message/inquiry content

**Optional Fields:**
- `inquiry_subject` (string) - Subject of the inquiry

**Success Response (200):**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Inquiry submitted successfully. We'll get back to you soon.",
  "data": {
    "inquiry_id": 1
  }
}
```

**Error Responses:**

*Missing Name (400):*
```json
{
  "status_code": 400,
  "status": "error",
  "message": "Error. Name is required.",
  "data": null
}
```

*Missing Email (400):*
```json
{
  "status_code": 400,
  "status": "error",
  "message": "Error. Email is required.",
  "data": null
}
```

*Invalid Email (400):*
```json
{
  "status_code": 400,
  "status": "error",
  "message": "Error. Please provide a valid email address.",
  "data": null
}
```

*Missing Message (400):*
```json
{
  "status_code": 400,
  "status": "error",
  "message": "Error. Message is required.",
  "data": null
}
```

**Example cURL:**
```bash
curl -X POST http://localhost:3000/api/public/inquiry \
  -H "Content-Type: application/json" \
  -d '{
    "inquiry_name": "John Doe",
    "inquiry_email": "john.doe@example.com",
    "inquiry_subject": "Question about subscription",
    "inquiry_message": "I would like to know more about your premium subscription plans."
  }'
```

---

## Admin Endpoints (Authentication Required)

All admin endpoints require authentication. Include the authentication token in the request headers.

### 2. Get Inquiries List (Admin)

**Endpoint:** `GET /admin/inquiry/list`

**Description:** Get a paginated list of all inquiries with filtering and sorting options.

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `page` (number, optional) - Page number (default: 1)
- `limit` (number, optional) - Items per page (default: 20)
- `search` (string, optional) - Search in name, email, or subject
- `status` (string, optional) - Filter by status: Active, Pending, In-Progress, Completed, Rejected, Deleted, Others, All
- `sortBy` (string, optional) - Sort field: inquiry_id, inquiry_name, inquiry_email, inquiry_status, created_at (default: created_at)
- `sortOrder` (string, optional) - Sort order: ASC, DESC (default: DESC)

**Success Response (200):**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Inquiries list retrieved successfully.",
  "data": {
    "inquiries": [
      {
        "inquiry_id": 1,
        "inquiry_name": "John Doe",
        "inquiry_email": "john.doe@example.com",
        "inquiry_subject": "Question about subscription",
        "inquiry_message": "I would like to know more about your premium subscription plans.",
        "inquiry_status": "Pending",
        "created_at": "2026-01-20T10:30:00.000Z",
        "last_modified": "2026-01-20T10:30:00.000Z"
      }
    ],
    "total": 15,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

**Example cURL:**
```bash
curl -X GET "http://localhost:3000/admin/inquiry/list?page=1&limit=20&status=Pending&sortBy=created_at&sortOrder=DESC" \
  -H "Authorization: Bearer <your_token>"
```

---

### 3. Get Inquiry Details (Admin)

**Endpoint:** `GET /admin/inquiry/details/:inquiry_id`

**Description:** Get detailed information about a specific inquiry.

**Headers:**
```
Authorization: Bearer <token>
```

**URL Parameters:**
- `inquiry_id` (number) - The ID of the inquiry

**Success Response (200):**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Inquiry details retrieved successfully.",
  "data": {
    "inquiry_id": 1,
    "inquiry_name": "John Doe",
    "inquiry_email": "john.doe@example.com",
    "inquiry_subject": "Question about subscription",
    "inquiry_message": "I would like to know more about your premium subscription plans.",
    "inquiry_status": "Pending",
    "created_at": "2026-01-20T10:30:00.000Z",
    "last_modified": "2026-01-20T10:30:00.000Z"
  }
}
```

**Error Response (404):**
```json
{
  "status_code": 404,
  "status": "error",
  "message": "Error. Inquiry not found.",
  "data": null
}
```

**Example cURL:**
```bash
curl -X GET http://localhost:3000/admin/inquiry/details/1 \
  -H "Authorization: Bearer <your_token>"
```

---

### 4. Update Inquiry Status (Admin)

**Endpoint:** `PUT /admin/inquiry/status/:inquiry_id`

**Description:** Update the status of an inquiry.

**Headers:**
```
Authorization: Bearer <token>
```

**URL Parameters:**
- `inquiry_id` (number) - The ID of the inquiry

**Request Body:**
```json
{
  "status": "In-Progress"
}
```

**Valid Status Values:**
- `Active`
- `Pending`
- `In-Progress`
- `Completed`
- `Rejected`
- `Deleted`
- `Others`

**Success Response (200):**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Inquiry status updated successfully.",
  "data": {
    "affectedRows": 1
  }
}
```

**Error Responses:**

*Invalid Status (400):*
```json
{
  "status_code": 400,
  "status": "error",
  "message": "Error. Invalid status. Valid values are: Active, Pending, In-Progress, Completed, Rejected, Deleted, Others",
  "data": null
}
```

*Inquiry Not Found (404):*
```json
{
  "status_code": 404,
  "status": "error",
  "message": "Error. Inquiry not found.",
  "data": null
}
```

**Example cURL:**
```bash
curl -X PUT http://localhost:3000/admin/inquiry/status/1 \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{"status": "Completed"}'
```

---

### 5. Delete Inquiry (Admin)

**Endpoint:** `DELETE /admin/inquiry/delete/:inquiry_id`

**Description:** Soft delete an inquiry (sets status to 'Deleted').

**Headers:**
```
Authorization: Bearer <token>
```

**URL Parameters:**
- `inquiry_id` (number) - The ID of the inquiry

**Success Response (200):**
```json
{
  "status_code": 200,
  "status": "success",
  "message": "Inquiry deleted successfully.",
  "data": {
    "affectedRows": 1
  }
}
```

**Error Response (404):**
```json
{
  "status_code": 404,
  "status": "error",
  "message": "Error. Inquiry not found.",
  "data": null
}
```

**Example cURL:**
```bash
curl -X DELETE http://localhost:3000/admin/inquiry/delete/1 \
  -H "Authorization: Bearer <your_token>"
```

---

## Status Workflow

The inquiry status follows this typical workflow:

1. **Pending** - Initial status when inquiry is created (default)
2. **Active** - Inquiry has been reviewed and is being worked on
3. **In-Progress** - Actively being handled
4. **Completed** - Inquiry has been resolved
5. **Rejected** - Inquiry was rejected or invalid
6. **Deleted** - Soft deleted
7. **Others** - Other custom statuses

---

## Integration Examples

### JavaScript/Fetch Example (Public Inquiry)

```javascript
async function submitInquiry(name, email, subject, message) {
  try {
    const response = await fetch('http://localhost:3000/api/public/inquiry', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inquiry_name: name,
        inquiry_email: email,
        inquiry_subject: subject,
        inquiry_message: message
      })
    });
    
    const data = await response.json();
    
    if (data.status === 'success') {
      console.log('Inquiry submitted:', data.data.inquiry_id);
      return true;
    } else {
      console.error('Error:', data.message);
      return false;
    }
  } catch (error) {
    console.error('Network error:', error);
    return false;
  }
}

// Usage
submitInquiry(
  'John Doe',
  'john@example.com',
  'Support Question',
  'I need help with my account'
);
```

### React Form Component Example

```jsx
import React, { useState } from 'react';

function InquiryForm() {
  const [formData, setFormData] = useState({
    inquiry_name: '',
    inquiry_email: '',
    inquiry_subject: '',
    inquiry_message: ''
  });
  const [status, setStatus] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('sending');

    try {
      const response = await fetch('http://localhost:3000/api/public/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (data.status === 'success') {
        setStatus('success');
        setFormData({ inquiry_name: '', inquiry_email: '', inquiry_subject: '', inquiry_message: '' });
      } else {
        setStatus('error');
      }
    } catch (error) {
      setStatus('error');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Name"
        value={formData.inquiry_name}
        onChange={(e) => setFormData({...formData, inquiry_name: e.target.value})}
        required
      />
      <input
        type="email"
        placeholder="Email"
        value={formData.inquiry_email}
        onChange={(e) => setFormData({...formData, inquiry_email: e.target.value})}
        required
      />
      <input
        type="text"
        placeholder="Subject"
        value={formData.inquiry_subject}
        onChange={(e) => setFormData({...formData, inquiry_subject: e.target.value})}
      />
      <textarea
        placeholder="Message"
        value={formData.inquiry_message}
        onChange={(e) => setFormData({...formData, inquiry_message: e.target.value})}
        required
      />
      <button type="submit" disabled={status === 'sending'}>
        {status === 'sending' ? 'Sending...' : 'Submit'}
      </button>
      {status === 'success' && <p>Thank you! We'll get back to you soon.</p>}
      {status === 'error' && <p>Something went wrong. Please try again.</p>}
    </form>
  );
}
```

---

## Notes

- The public inquiry endpoint (`/api/public/inquiry`) does **NOT** require authentication
- All admin endpoints require valid authentication tokens
- Inquiries are soft-deleted (status set to 'Deleted') rather than permanently removed
- By default, the list endpoint excludes deleted inquiries unless specifically filtered
- Email validation uses a basic regex pattern: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- The default status when creating an inquiry is 'Pending'
- All timestamps are in ISO 8601 format with timezone

---

## Security Considerations

1. **Rate Limiting:** Consider implementing rate limiting on the public inquiry endpoint to prevent spam
2. **Email Validation:** The current validation is basic. Consider using a more robust email validation service
3. **Spam Protection:** Consider adding CAPTCHA or similar protection to the public endpoint
4. **Input Sanitization:** All inputs are passed to the database with parameterized queries to prevent SQL injection
5. **Admin Authentication:** Ensure admin endpoints are properly protected with authentication middleware

---

## Future Enhancements

- Add email notifications when inquiries are created/updated
- Add file attachment support
- Add reply/response tracking
- Add inquiry categories/types
- Add SLA tracking for response times
- Add bulk operations for admins
- Add inquiry assignment to specific admin users
