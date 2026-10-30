# Firebase Setup (Hinglish)

## Step 1: Project banao
1. Jaao https://console.firebase.google.com
2. Add project -> naam do (masjid-survey)
3. Google Analytics skip kar lo (optional)

## Step 2: Web app add karo
1. Project overview > Add app > Web (</>)
2. App nickname: Mohalla Survey
3. Register app -> config copy karo

## Step 3: Config paste karo
1. Repo me `firebase-config.js` kholo
2. Upar se copy kiya hua config paste karo
3. Save karo

## Step 4: Authentication enable karo
1. Build > Authentication > Get started
2. Sign-in method > Email/Password -> Enable -> Save
3. Users > Add user -> apna email aur password banao (yehi committee member login karega)

## Step 5: Firestore Database enable karo
1. Build > Firestore Database > Create database
2. Location: asia-south1 (ya nearest)
3. Start in production mode
4. Create

## Step 6: Security Rules publish karo
1. Firestore Database > Rules tab
2. Repo se `firestore.rules` ka pura content copy karke paste karo
3. Publish karo

## Step 7: Site par test karo
1. GitHub Pages par site kholo
2. Sidebar footer me login button se Firebase login karo (email+password)
3. "Upload old data from this device" dabao -> migrate ho jayega
4. Dusre phone/laptop se same site kholo aur same login se sign in karo -> same data dikhega
5. Status "Cloud sync: Synced" dikhna chahiye

## Notes
- Sirf login kiye hue users hi data dekh/save kar paayenge
- LocalStorage ab cache ke taur par use hoga
- icon.png root me rakho (header/fav/og-image)
- Site noindex hai (Google me nahi aayega)
