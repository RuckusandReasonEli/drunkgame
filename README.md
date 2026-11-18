# Drunk: the game

An 8-bit browser game about Eli Lie's single "Drunk" (and maybe also your life?).

Play it: https://ruckusandreasoneli.github.io/drunkgame/

- `index.html`: the whole game (no build step)
- `img/`: pixel-art backgrounds
- `8 bit version.mp3`: the soundtrack

To change the streaming links, edit the `LINKS` list near the top of the script in `index.html`.


## Play stats

`stats.js` sends one anonymous row per play session to the **Game Sessions** tab of the Eli Lie Fan Data Google Sheet (through the same Apps Script web app as the website's mailing list). It records city and state (looked up from the visitor's IP; the IP itself is never stored), the referring site or `utm_source`, seconds spent in each place, the path through town, the ending, and listen/hint clicks. The **Game Summary** tab totals it.

Tip: share links with a tag so you know what worked, for example `https://ruckusandreasoneli.github.io/drunkgame/?utm_source=instagram`.
