EcoSwap storefront and admin dashboard

Requirements: Node.js 22 or newer.

Setup:
1. Copy .env.example to .env (in PowerShell: Copy-Item .env.example .env).
2. Replace the ADMIN_EMAIL and ADMIN_PASSWORD placeholders with your admin email and a unique password of at least 12 characters.
3. Run npm install.
4. Run `npm start` from the project folder. Keep that terminal open while using the site.
5. Open http://localhost:3000 for the storefront. Use the address and port printed by the server; do not use VS Code Live Server or another static-file preview port, because the app needs its backend API. Sign in as the admin from the Account section to open the dashboard; it is not linked separately in the storefront.

Customer accounts use email/password; passwords are stored as scrypt hashes. Customers can update their profile, manage multiple saved delivery addresses, carts and wishlists, place orders, track and cancel eligible orders, reorder, post verified-purchase reviews, and manage subscriptions.

The homepage features an automatically gliding featured-product gallery, organic-living benefits, and product-category collections. The full product catalogue and prices are on the separate `/products.html` page; category cards, homepage search, Shop, and wishlist navigation open that page with the requested selection.

The admin dashboard provides date-filtered order totals, top products ranked by units ordered, number of orders, or product order value, a daily order-value chart, CSV export, order fulfilment controls, and product price/stock/visibility management. Order value includes COD and demo-payment orders; it is not a record of collected or settled payments. Admin credentials are read only from server environment variables.

SQLite data is stored in data/ecoswap.sqlite and is created automatically on first launch. The included product catalogue is seeded on first launch; inventory and prices can then be edited in the dashboard.

Checkout offers cash on delivery plus UPI, debit/credit card, net banking, and wallet demo selections. Demo selections store the chosen method with the order but never process or charge a payment; the checkout never asks for banking or card details. Real online payment processing, email/SMS notifications, password reset/verification, and production hosting configuration require external services and are not enabled.
