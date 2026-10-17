const REVIEWS_STORAGE_KEY = "middelauto-customer-reviews";

const reviewList = document.querySelector("#review-list");
const reviewForm = document.querySelector("#customer-review-form");
const reviewMessage = document.querySelector("#review-form-message");
const reviewSearch = document.querySelector("#review-search");
const reviewEmpty = document.querySelector("#review-empty");
const reviewNoResults = document.querySelector("#review-no-results");
const ratingFilters = [...document.querySelectorAll(".review-filters .filter-chip")];

let reviews = [];
let activeRating = "All";
let storageAvailable = true;

document.querySelector("#current-year").textContent = new Date().getFullYear();
reviewForm.elements.date.value = new Date().toISOString().slice(0, 10);
document.querySelector("#write-review-button").addEventListener("click", focusReviewForm);
document.querySelector("#summary-review-button").addEventListener("click", focusReviewForm);
document.querySelector("#empty-review-button").addEventListener("click", focusReviewForm);
reviewSearch.addEventListener("input", renderReviews);
reviewForm.addEventListener("submit", addReview);

for (const button of ratingFilters) {
  button.addEventListener("click", () => {
    activeRating = button.dataset.rating;
    for (const filter of ratingFilters) {
      const selected = filter === button;
      filter.classList.toggle("selected", selected);
      filter.setAttribute("aria-pressed", String(selected));
    }
    renderReviews();
  });
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function formatDate(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" })
    .format(new Date(`${date}T12:00:00`));
}

function readReviews() {
  try {
    const stored = localStorage.getItem(REVIEWS_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(parsed) || parsed.some((review) =>
      typeof review.id !== "string"
      || typeof review.name !== "string"
      || typeof review.service !== "string"
      || typeof review.text !== "string"
      || !Number.isInteger(review.rating)
      || review.rating < 1
      || review.rating > 5
      || typeof review.date !== "string")) {
      throw new Error("Stored reviews have an invalid format.");
    }
    return parsed.sort((a, b) => b.date.localeCompare(a.date));
  } catch (error) {
    console.error("Could not load customer reviews.", error);
    storageAvailable = false;
    return null;
  }
}

function saveReviews(nextReviews) {
  try {
    localStorage.setItem(REVIEWS_STORAGE_KEY, JSON.stringify(nextReviews));
    return true;
  } catch (error) {
    console.error("Could not save customer review.", error);
    storageAvailable = false;
    reviewMessage.textContent = "Couldn't save this review in your browser. Check available storage and try again.";
    showStorageError();
    return false;
  }
}

function renderSummary() {
  if (!storageAvailable) {
    document.querySelector("#average-rating").textContent = "—";
    document.querySelector("#average-stars").textContent = "☆☆☆☆☆";
    document.querySelector("#average-stars").setAttribute("aria-label", "Ratings unavailable");
    document.querySelector("#rating-total").textContent = "Ratings unavailable";
    document.querySelector("#review-count").textContent = "—";
    document.querySelector("#rating-bars").replaceChildren();
    return;
  }

  const average = reviews.length
    ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
    : 0;
  const averageElement = document.querySelector("#average-rating");
  const starsElement = document.querySelector("#average-stars");
  averageElement.textContent = reviews.length ? average.toFixed(1) : "—";
  starsElement.textContent = `${"★".repeat(Math.round(average))}${"☆".repeat(5 - Math.round(average))}`;
  starsElement.setAttribute("aria-label", reviews.length
    ? `${average.toFixed(1)} out of 5 stars`
    : "No ratings yet");
  document.querySelector("#rating-total").textContent =
    `${reviews.length} ${reviews.length === 1 ? "review" : "reviews"}`;
  document.querySelector("#review-count").textContent = reviews.length;

  const bars = document.querySelector("#rating-bars");
  bars.replaceChildren();
  for (let rating = 5; rating >= 1; rating -= 1) {
    const count = reviews.filter((review) => review.rating === rating).length;
    const row = document.createElement("div");
    row.className = "rating-bar-row";
    row.innerHTML = `
      <span>${rating} <span aria-hidden="true">★</span></span>
      <span class="rating-bar-track"><span class="rating-bar-fill" style="width: ${reviews.length ? count / reviews.length * 100 : 0}%"></span></span>
      <span>${count}</span>`;
    bars.append(row);
  }
}

function renderReviews() {
  if (!storageAvailable) {
    showStorageError();
    return;
  }

  const query = reviewSearch.value.trim().toLowerCase();
  const filtered = reviews.filter((review) => {
    const matchesRating = activeRating === "All" || review.rating === Number(activeRating);
    const matchesSearch = `${review.name} ${review.service} ${review.text}`.toLowerCase().includes(query);
    return matchesRating && matchesSearch;
  });

  reviewList.replaceChildren();
  for (const review of filtered) reviewList.append(createReviewCard(review));
  reviewEmpty.hidden = reviews.length > 0;
  reviewNoResults.hidden = reviews.length === 0 || filtered.length > 0;
  if (reviews.length === 0) reviewEmpty.hidden = false;
}

function showStorageError() {
  const message = document.createElement("p");
  message.className = "storage-error";
  message.textContent = "Customer reviews could not be loaded or saved in this browser. Check storage permissions and refresh the page.";
  reviewList.replaceChildren(message);
  reviewEmpty.hidden = true;
  reviewNoResults.hidden = true;
}

function createReviewCard(review) {
  const card = document.createElement("article");
  card.className = "review-card";
  const stars = "★".repeat(review.rating) + "☆".repeat(5 - review.rating);
  const name = escapeHtml(review.name || "Mid-Del Auto customer");
  const service = escapeHtml(review.service || "Customer visit");
  const date = escapeHtml(formatDate(review.date));
  const text = escapeHtml(review.text);
  card.innerHTML = `
    <div class="review-card-top">
      <span class="review-card-stars" aria-label="${review.rating} out of 5 stars">${stars}</span>
      ${date ? `<time>${date}</time>` : ""}
    </div>
    <blockquote>“${text}”</blockquote>
    <div class="review-card-footer">
      <span class="review-avatar" aria-hidden="true">${escapeHtml((review.name || "M").trim().charAt(0).toUpperCase())}</span>
      <span class="review-author">${name}</span>
      <span class="project-service">${service}</span>
    </div>`;
  return card;
}

function focusReviewForm() {
  document.querySelector("#review-form").scrollIntoView({ behavior: "smooth", block: "center" });
  reviewForm.elements.rating.focus({ preventScroll: true });
}

function addReview(event) {
  event.preventDefault();
  reviewMessage.textContent = "";
  if (!reviewForm.reportValidity()) return;

  const data = new FormData(reviewForm);
  const review = {
    id: crypto.randomUUID(),
    name: data.get("name").trim(),
    service: data.get("service"),
    rating: Number(data.get("rating")),
    date: data.get("date") || new Date().toISOString().slice(0, 10),
    text: data.get("text").trim(),
  };
  if (!review.text || !Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5) {
    reviewMessage.textContent = "Add a written review and choose a rating from 1 to 5 stars.";
    return;
  }

  const nextReviews = [review, ...reviews];
  if (!saveReviews(nextReviews)) return;
  reviews = nextReviews;
  reviewForm.reset();
  reviewForm.elements.date.value = new Date().toISOString().slice(0, 10);
  activeRating = "All";
  for (const filter of ratingFilters) {
    const selected = filter.dataset.rating === "All";
    filter.classList.toggle("selected", selected);
    filter.setAttribute("aria-pressed", String(selected));
  }
  reviewSearch.value = "";
  renderSummary();
  renderReviews();
  document.querySelector("#customer-reviews").scrollIntoView({ behavior: "smooth" });
}

const savedReviews = readReviews();
if (savedReviews) reviews = savedReviews;
renderSummary();
renderReviews();
