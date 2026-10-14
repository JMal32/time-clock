// An error whose message is safe to show to the person using the app.
// `status` is the HTTP status code the API answers with (400, 404, 409...).
export class AppError extends Error {
  constructor(status, message, details = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
