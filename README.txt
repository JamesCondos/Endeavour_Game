BEAT THE AI

PLAY
Open index.html, or the portable "Endeavour Booth.html", in your browser.
Keep scoreboard-config.js beside the HTML file.
Choose a nickname and predict the next network speed from each chart.
Everyone plays the same three examples with a 30-minute forecast horizon.
Lock in three guesses to compare your average error with the AI forecast.
Lower average error wins.

SHARED SCOREBOARD
Supabase is connected. Each completed game saves automatically when online.
All results are stored; the scoreboard shows the best 20 games across devices.
Players do not need an account. Nicknames and scores are visible to other players.
If a save cannot reach the server, it is queued in that browser and retried.
Keep or reopen the game in the same browser when the connection returns.
Clearing browser storage before a queued result uploads can lose that result.
If the browser blocks storage, keep the page open until the score is saved.
After correcting scoreboard settings, reload and use "Retry pending scores" to
retry retained scores that were rejected before the correction.
The connected project is Endeavour Scoreboard in Sydney.
Project dashboard: https://supabase.com/dashboard/project/ujpebndgvajtftpgezmy

The owner setup is in the separate "Endeavour Scoreboard Setup.zip".
In the editable source folder, see SETUP-SCOREBOARD.txt and supabase/setup.sql.
The setup files do not need to be uploaded to GitHub Pages.

PUBLISH ON GITHUB PAGES
1. Extract the configured "Endeavour Booth.zip".
   It contains index.html, scoreboard-config.js, .nojekyll and README.txt.
   The same four files are also available in the dist folder.
2. Create a public GitHub repository, for example "beat-the-ai".
3. Keep the included scoreboard-config.js; it is already connected.
   Upload the four files to the root of the main branch and commit them.
   Upload the extracted files, not the ZIP or an enclosing folder.
4. Open repository Settings > Pages. Under Build and deployment, choose
   "Deploy from a branch", select "main" and "/(root)", then Save.
5. Wait for deployment, then open the site URL shown in Settings > Pages.
   A project site normally looks like https://YOUR-USERNAME.github.io/beat-the-ai/.
6. Generate your QR code using that deployed HTTPS site URL. Test the code with
   a phone before printing it. Anyone scanning it can play in their browser.

The game code and chart data are embedded in index.html. The small configuration
file remains separate so it can be edited without a build step. GitHub Pages
serves the game; Supabase stores and ranks shared scores.
.nojekyll disables Jekyll processing.

GitHub's publishing instructions:
https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

REBUILD AFTER EDITING
When editing this repository's index.html directly, run:
  python update_csp.py
  python update_csp.py --check
Run these before committing or publishing, including after wording changes.
The page's Content Security Policy verifies its inline scripts and styles;
outdated hashes cause the browser to block the game from loading.

From the editable endeavour_booth folder, run: python package_app.py
This refreshes dist, "Endeavour Booth.html", the accompanying scoreboard-config.js,
"Endeavour Booth.zip" and "Endeavour Scoreboard Setup.zip".
Edit the source scoreboard-config.js before rebuilding; rebuilding replaces the
distribution and portable copies with that source version.
