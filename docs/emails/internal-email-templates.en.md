# Internal Business Email Templates (English Only)

This file contains user-facing email templates managed by the app backend (not Supabase Auth templates).

## Global Rules

- Language: English only
- Tone: clear, friendly, and action-oriented
- From name: Hizli Carpooling
- Reply-to: support@yourdomain.com
- Footer (all templates):
  - "You are receiving this email because you have an account on Hizli Carpooling."
  - "Need help? Contact support@yourdomain.com"
  - "Hizli Team"

## Template Contract

Each template should include:

- `template_id`
- `trigger_event`
- `recipient`
- `subject`
- `preheader`
- `primary_cta_label`
- `primary_cta_url`
- `variables`
- `html_body`
- `text_body`

---

## 1) Welcome Email

- `template_id`: `welcome_email_v1`
- `trigger_event`: user account created (first successful signup)
- `recipient`: new user
- `subject`: Welcome to Hizli Carpooling
- `preheader`: Your account is ready. Here is how to get started.
- `primary_cta_label`: Complete my profile
- `primary_cta_url`: `{{profile_url}}`
- `variables`: `first_name`, `profile_url`, `support_url`

`html_body`

```html
<p>Hi {{first_name}},</p>
<p>Welcome to <strong>Hizli Carpooling</strong>. We are delighted to welcome you to our carpooling community.</p>
<p>Here are the essential steps to get started:</p>
<ol>
  <li><strong>Complete your profile</strong> and personalize your information.</li>
  <li><strong>Upload your documents</strong> to verify your identity and build trust.</li>
  <li><strong>Become a driver (optional)</strong> by adding your car details.</li>
</ol>
<p><strong>Tip:</strong> Verified profiles receive more requests and interactions.</p>
<p><a href="{{profile_url}}">Complete my profile</a></p>
<p>Need help? Reply to this email and our team will assist you.</p>
<p><a href="{{support_url}}">Contact support</a></p>
<p>Hizli Team</p>
```

`text_body`

```text
Hi {{first_name}},

Welcome to Hizli Carpooling.
We are delighted to welcome you to our carpooling community.

Here are the essential steps to get started:
1) Complete your profile and personalize your information
2) Upload your documents to verify your identity
3) Become a driver (optional) by adding your car details

Tip: Verified profiles receive more requests and interactions.

Complete my profile: {{profile_url}}
Contact support: {{support_url}}

Hizli Team
```

---

## 2) Profile Completion Reminder

- `template_id`: `profile_completion_reminder_v1`
- `trigger_event`: profile incomplete after N days
- `recipient`: user with incomplete profile
- `subject`: Complete your profile to unlock all features
- `preheader`: Finish setup to publish rides and increase trust.
- `primary_cta_label`: Finish profile
- `primary_cta_url`: `{{profile_url}}`
- `variables`: `first_name`, `profile_url`

`text_body`

```text
Hi {{first_name}},

Your profile is still incomplete.
Complete your profile to unlock all features and make your account more trusted.

Finish profile: {{profile_url}}

Hizli Team
```

---

## 3) Verification Approved

- `template_id`: `verification_approved_v1`
- `trigger_event`: account verification approved
- `recipient`: verified user
- `subject`: Your verification has been approved
- `preheader`: You can now access verified user features.
- `primary_cta_label`: Open dashboard
- `primary_cta_url`: `{{dashboard_url}}`
- `variables`: `first_name`, `dashboard_url`

`text_body`

```text
Hi {{first_name}},

Great news. Your verification has been approved.
You now have access to verified user features.

Open dashboard: {{dashboard_url}}

Hizli Team
```

---

## 4) Verification Rejected

- `template_id`: `verification_rejected_v1`
- `trigger_event`: verification rejected by admin
- `recipient`: user
- `subject`: Action required: verification update needed
- `preheader`: Please review the reason and resubmit your documents.
- `primary_cta_label`: Review and resubmit
- `primary_cta_url`: `{{documents_url}}`
- `variables`: `first_name`, `documents_url`, `rejection_reason`

`text_body`

```text
Hi {{first_name}},

Your verification could not be approved yet.
Reason: {{rejection_reason}}

Please update and resubmit your documents.

Review and resubmit: {{documents_url}}

Hizli Team
```

---

## 5) New Booking Request (Driver)

- `template_id`: `booking_request_received_v1`
- `trigger_event`: passenger requests seats on driver's ride
- `recipient`: driver
- `subject`: New booking request for your ride
- `preheader`: A passenger requested seats. Review now.
- `primary_cta_label`: Review request
- `primary_cta_url`: `{{ride_requests_url}}`
- `variables`: `driver_first_name`, `passenger_name`, `ride_route`, `ride_date`, `seats_requested`, `ride_requests_url`

`text_body`

```text
Hi {{driver_first_name}},

You have a new booking request.

Passenger: {{passenger_name}}
Route: {{ride_route}}
Date: {{ride_date}}
Seats requested: {{seats_requested}}

Review request: {{ride_requests_url}}

Hizli Team
```

---

## 6) Booking Accepted (Passenger)

- `template_id`: `booking_accepted_v1`
- `trigger_event`: driver confirms booking
- `recipient`: passenger
- `subject`: Your booking has been confirmed
- `preheader`: Your seat is confirmed. Check ride details.
- `primary_cta_label`: View booking
- `primary_cta_url`: `{{my_bookings_url}}`
- `variables`: `passenger_first_name`, `ride_route`, `ride_date`, `driver_name`, `my_bookings_url`

`text_body`

```text
Hi {{passenger_first_name}},

Your booking has been confirmed.

Route: {{ride_route}}
Date: {{ride_date}}
Driver: {{driver_name}}

View booking: {{my_bookings_url}}

Hizli Team
```

---

## 7) Booking Rejected (Passenger)

- `template_id`: `booking_rejected_v1`
- `trigger_event`: driver rejects booking
- `recipient`: passenger
- `subject`: Update on your booking request
- `preheader`: Your booking request was not accepted.
- `primary_cta_label`: Find another ride
- `primary_cta_url`: `{{search_rides_url}}`
- `variables`: `passenger_first_name`, `ride_route`, `ride_date`, `search_rides_url`

`text_body`

```text
Hi {{passenger_first_name}},

Your booking request was not accepted.

Route: {{ride_route}}
Date: {{ride_date}}

Find another ride: {{search_rides_url}}

Hizli Team
```

---

## 8) Booking Cancelled

- `template_id`: `booking_cancelled_v1`
- `trigger_event`: booking cancelled by driver or passenger
- `recipient`: opposite party
- `subject`: Booking cancelled
- `preheader`: Your booking status changed to cancelled.
- `primary_cta_label`: View details
- `primary_cta_url`: `{{booking_url}}`
- `variables`: `first_name`, `cancelled_by`, `ride_route`, `ride_date`, `booking_url`

`text_body`

```text
Hi {{first_name}},

This booking has been cancelled.

Cancelled by: {{cancelled_by}}
Route: {{ride_route}}
Date: {{ride_date}}

View details: {{booking_url}}

Hizli Team
```

---

## 9) Ride Updated

- `template_id`: `ride_updated_v1`
- `trigger_event`: ride details changed
- `recipient`: impacted bookings
- `subject`: Your ride details were updated
- `preheader`: The route or schedule changed. Please review.
- `primary_cta_label`: Review ride
- `primary_cta_url`: `{{booking_url}}`
- `variables`: `first_name`, `ride_route`, `old_date`, `new_date`, `booking_url`

`text_body`

```text
Hi {{first_name}},

Your ride details were updated.

Route: {{ride_route}}
Previous date/time: {{old_date}}
New date/time: {{new_date}}

Review ride: {{booking_url}}

Hizli Team
```

---

## 10) Ride Cancelled

- `template_id`: `ride_cancelled_v1`
- `trigger_event`: driver cancels a ride with active bookings
- `recipient`: impacted passengers
- `subject`: Ride cancelled
- `preheader`: Your scheduled ride has been cancelled.
- `primary_cta_label`: Find a new ride
- `primary_cta_url`: `{{search_rides_url}}`
- `variables`: `first_name`, `ride_route`, `ride_date`, `search_rides_url`

`text_body`

```text
Hi {{first_name}},

Your scheduled ride has been cancelled.

Route: {{ride_route}}
Date: {{ride_date}}

Find a new ride: {{search_rides_url}}

Hizli Team
```

---

## 11) Dashboard Message Notification (Member Email)

- `template_id`: `dashboard_message_notification_v1`
- `trigger_event`: new admin message posted to member dashboard inbox
- `recipient`: member
- `subject`: You have a new message on Hizli Carpooling
- `preheader`: A new message is waiting for you in your dashboard.
- `primary_cta_label`: Open dashboard
- `primary_cta_url`: `{{dashboard_url}}`
- `variables`: `first_name`, `message_subject`, `dashboard_url`

`text_body`

```text
Hi {{first_name}},

You received a new message on your Hizli Carpooling dashboard.

Subject: {{message_subject}}

Open dashboard: {{dashboard_url}}

Hizli Team
```

---

## 12) Admin Refund Review Alert (Internal)

- `template_id`: `admin_refund_review_alert_v1`
- `trigger_event`: ride updated/cancelled and booking/payment impact detected
- `recipient`: admin operations team
- `subject`: Refund review needed for ride change
- `preheader`: A ride change may require refund handling.
- `primary_cta_label`: Open admin dashboard
- `primary_cta_url`: `{{admin_dashboard_url}}`
- `variables`: `ride_public_id`, `ride_route`, `old_date`, `new_date`, `affected_bookings_count`, `potential_refund_amount`, `admin_dashboard_url`

`text_body`

```text
Hello Admin Team,

A ride update requires review for potential refunds.

Ride ID: {{ride_public_id}}
Route: {{ride_route}}
Previous date/time: {{old_date}}
New date/time: {{new_date}}
Affected bookings: {{affected_bookings_count}}
Potential refund amount: {{potential_refund_amount}}

Open admin dashboard: {{admin_dashboard_url}}

Hizli Team
```

---

## 13) Post-Ride Review Request

- `template_id`: `review_request_v1`
- `trigger_event`: completed ride and no review submitted after N hours
- `recipient`: passenger or driver
- `subject`: How was your ride?
- `preheader`: Leave a quick review to help the community.
- `primary_cta_label`: Leave a review
- `primary_cta_url`: `{{review_url}}`
- `variables`: `first_name`, `ride_route`, `ride_date`, `review_url`

`text_body`

```text
Hi {{first_name}},

Your ride has ended.
Would you share a quick review?

Route: {{ride_route}}
Date: {{ride_date}}

Leave a review: {{review_url}}

Hizli Team
```

---

## Implementation Notes

- Keep Supabase Auth emails in Supabase dashboard templates.
- Use these templates for app business events only.
- For admin/member messaging, keep dashboard conversation as source of truth and send only one personal email notification using `dashboard_message_notification_v1`.
- Trigger `admin_refund_review_alert_v1` when ride changes may impact paid bookings.
- Start with these priority templates:
  1) `welcome_email_v1`
  2) `booking_request_received_v1`
  3) `booking_accepted_v1`
  4) `booking_rejected_v1`
  5) `dashboard_message_notification_v1`
  6) `admin_refund_review_alert_v1`
