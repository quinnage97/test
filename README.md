# Innsbruck at Christmas ✈️🚆🎄

A small travel site for our trip: Glasgow → Amsterdam → Munich → the Mittenwald line → Innsbruck.

## Tabs

- **Journey**: a timeline of each stage of the trip (Glasgow Airport, the Schiphol connection, Munich, the Mittenwald train, Innsbruck, the trip home). Each stage has what you need, what to do, tips, a box for your flight numbers and booking refs, and a "Show on map" link. Ticks and notes are saved.
- **Map**: an interactive map of Innsbruck with pins for every Christmas market (each says what it is and how to get there), coffee shops, restaurants, sights and hidden gems, and your own Instagram saves. You can filter by category, use "Whole journey" to see the route from Glasgow, and tap a pin for directions in Google Maps.
- **Itinerary**: a day-by-day plan you can edit. Tap any stop to jump to it on the map. On the side:
  - **Instagram saves**: paste a post or reel link, give it a name, then pin it on the map and/or add it to a day.
  - **Austrian food bucket list**: tick things off as you try them.
  - **Export / Import**: back up your plan or copy it to another phone.

## Running it

It's a plain static site with no build step. Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

To put it online for free, enable **GitHub Pages** (Settings → Pages → deploy from branch, root folder).

## Editing the content

All places, markets, timeline stages, the food list and the suggested itinerary live in [`js/data.js`](js/data.js). To add a place, add an entry with its `lat`/`lng` and a category.

Your edits in the app (ticks, notes, itinerary changes, Instagram saves) are stored in the browser's local storage. They stay on that device, so use Export/Import to move them.

> Christmas market dates and opening hours change every year, so double-check them before you go.
