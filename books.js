/* Shared catalog of PDF books used by the library reader AND the flashcard
   generator. `id` is the stable key used in bookmarks, highlights, and tracker
   references. Anything that needs to map a bookmark back to a PDF file (path,
   page count, etc.) should pull from here. */
const BOOKS = [
  {
    id:       "bio11",
    flipId:   "bio11",                  // alias kept for back-compat with old bookmarks
    title:    "Biology",
    cls:      "Class 11",
    subject:  "biology",
    type:     "book",
    file:     "books/biology class 11.pdf",
    pages:    504,
    gradient: "linear-gradient(160deg,#2e6b3a 0%,#1a4022 60%,#0f2914 100%)"
  },
  {
    id:       "bio12",
    flipId:   "bio12",
    title:    "Biology",
    cls:      "Class 12",
    subject:  "biology",
    type:     "book",
    file:     "books/BIology classs 12.pdf",
    pages:    586,
    gradient: "linear-gradient(160deg,#5d2a52 0%,#341330 60%,#1d0a1a 100%)"
  }
];

/* The four subject "cabinets". Used by library.html for the home screen and
   for the per-subject default cover gradient on user-added PDFs. */
const SUBJECTS = {
  biology:   { emoji: "🧬", name: "Biology",   gradient: "linear-gradient(160deg,#2e6b3a 0%,#1a4022 60%,#0f2914 100%)" },
  physics:   { emoji: "⚛️", name: "Physics",   gradient: "linear-gradient(160deg,#1e3a8a 0%,#16275e 60%,#0c1632 100%)" },
  chemistry: { emoji: "⚗️", name: "Chemistry", gradient: "linear-gradient(160deg,#a0522d 0%,#6b3119 60%,#3a1a0c 100%)" },
  math:      { emoji: "📐", name: "Math",      gradient: "linear-gradient(160deg,#5b21b6 0%,#3a1480 60%,#1e0b3b 100%)" }
};

/* Legacy Heyzine flipIds the app used before the PDF.js switch. Bookmarks made
   then store these IDs; we map them to the new BOOK ids on read. */
const LEGACY_FLIP_IDS = { '7cf699161c': 'bio11', '6619697548': 'bio12' };

function bookByFlipId(id) {
  const mapped = LEGACY_FLIP_IDS[id] || id;
  return BOOKS.find(b => b.id === mapped || b.flipId === mapped);
}
