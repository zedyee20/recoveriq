/** Example inputs so people can see the analyzer working before using their own documents. */
export const SAMPLES: { label: string; text: string }[] = [
  {
    label: 'Rejected refund',
    text: `From: Brightline Electronics <support@brightline-shop.com>
Subject: Your return request RMA-55821
Date: Oct 3, 2026

Hi there,

Thanks for contacting us about order #BL-204417. Unfortunately your refund request has been rejected because the item was returned after the 30-day window.

Order total: $249.99
Item: Noise-cancelling headphones (defective — left speaker not working)

Best,
Brightline Customer Care`,
  },
  {
    label: 'Security deposit',
    text: `Move-out confirmation — Unit 4B, 18 Harbor St
Landlord: Oakridge Property Management (rentals@oakridgepm.com)

Tenancy ended: 2026-08-31
Keys returned: 2026-08-31
Security deposit held: $1,800.00

Your deposit will be returned within the period required by law, less any deductions for damage.`,
  },
  {
    label: 'Rent deposit (₹)',
    text: `Subject: Final settlement — Flat 302, Lakeview Residency
Landlord: Mr. R. Kumar (rkumar.rentals@example.in)

Lease ended: 30/09/2026
Security deposit paid: Rs. 1,80,000
Deduction for painting: ₹12,000

Balance deposit refund due: ₹1,68,000
The refund will be processed after inspection.`,
  },
  {
    label: 'Flight delay',
    text: `Booking reference: QXR7TL
Flying with Northwind Air — flight NW 482

We're sorry. Your flight on 12 Sep 2026 was delayed by 4 hours 35 minutes due to operational reasons.
Fare paid: €312.40

Contact: claims@northwindair.com`,
  },
  {
    label: 'Unwanted renewal',
    text: `StreamPlus Receipt
Your annual plan has been renewed.
Amount charged: $119.99 on Nov 2, 2026
Invoice no: SP-99012-A

I cancelled this subscription in October but was charged again.
billing@streamplus.tv`,
  },
];
