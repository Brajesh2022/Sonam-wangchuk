# Stand with Sonam Wangchuk - Lok Sabha MP Email Advocacy Portal

A data-driven, client-side web application designed to help citizens identify their Member of Parliament (MP) and send a personalized, performance-aware email to demand accountability. 

This portal is designed to stand with activist Sonam Wangchuk's hunger strike and raise critical civic concerns regarding the NEET-UG exam paper leak.

## Key Features

* **Client-Side Spatial Lookup**: Utilizes [Turf.js](https://turfjs.org/) to run a client-side ray-casting Point-in-Polygon (PIP) search. Resolves coordinates directly into Indian Parliamentary Constituency boundaries without a backend database.
* **Smart Offline Caching**: Uses the browser's Cache API to cache the simplified India Lok Sabha 2024 GeoJSON map locally, ensuring near-instant subsequent load times.
* **Rule-Based Personalization Engine**: Dynamically selects email templates based on MP metrics:
  - **Party Affiliation**: Custom message variants (e.g., BJP vs. Non-BJP) to tailor appeals productively.
  - **Attendance Record**: Flags poor attendance (<50% sittings) or honors high attendance.
  - **Parliamentary Questions**: References the actual number of questions asked by the MP to ground the appeal in their record.
  - **Minister Status**: Automatically adapts context for Union Ministers who do not have standard attendance metrics.
* **Fallback Clipboard System**: Monitors browser focus after triggering a `mailto:` link. If the email client fails to launch (common on many desktop setups), it falls back to showing a modal containing copyable text fields.
* **Premium UX / Responsive UI**: Includes mobile-optimized bottom sheet panels supporting swipe-to-dismiss gestures built with raw pointer events.

---

## 📂 Project Structure

```
Sonam-wangchuk/
├── index.html          # Core single-page interface & layouts
├── style.css           # Modern, responsive design system & animations
├── app.js              # Application controller (caching, geocoding, and rules)
├── email_templates.json# Configuration rules and email template variants
├── mps_detail.json     # Enriched database of MPs (attendance, party, questions)
├── pindb.json          # Local geocoding database mapping PIN codes to coordinates
├── README.md           # Project documentation
└── template.txt        # Plaintext reference template
```
