# Stopgap: make the live booking form actually work

**Problem:** the form on zcdetailing.store shows "Request sent!" but sends nothing. Every request so far has been lost.
**Fix:** `index.html` here is the live page with:
- a real form wired to **Netlify Forms** (free, no backend)
- a new "Service Location" field
- campaign capture from QR links (`?campaign=worker|accc_student|accc_staff|auto_shop`)
- a spam honeypot
- an error message that falls back to your phone number
- the fake admin removed (password in public code, availability that only saved on one device)

**Not changed:** brand name, prices, copy. Those are your decisions (Q1/Q2 in the master spec).

## Deploy (about 10 minutes)
1. **Back up first.** Netlify → your site → **Deploys** → click the current deploy → **Download**.
2. Netlify → **Site configuration → Forms → Enable form detection** (needed once).
3. Put `index.html` alone in a folder, then drag that folder onto **Deploys** ("Drag and drop your site output folder here").
   - If the site is connected to Git, commit the file to that repo instead.
4. Netlify → **Forms**: a form named **booking** should appear.
5. **Forms → Form notifications → Add notification → Email notification** → your email, form `booking`.
6. **Test it on your phone:** open `https://zcdetailing.store/?campaign=worker`, submit a booking, and confirm it shows up in Netlify Forms with `campaign = worker` and that the email arrives.

## Tested here
Mobile browser (iPhone 13 profile) against a local stand-in for Netlify's form endpoint:
- the page fits at phone width with no sideways scroll
- empty submits are blocked
- every field, `form-name=booking` and the campaign are posted URL-encoded
- the campaign survives navigation; unknown campaign values are ignored
- the failure path shows the phone number and re-enables the button
- no JavaScript errors

**Not tested:** real Netlify Forms. That only happens on Netlify after deploy, which is what step 6 is for.

## Limits
This is a request form, not booking: no payments, no live availability, and you still confirm each request by text or call. Phase 1 replaces it.
