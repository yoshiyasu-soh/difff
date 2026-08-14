export interface Messages {
  publishSuccess: (url: string) => string;
  publishFailure: (error: string) => string;
  deleteSuccess: string;
  deleteFailure: (error: string) => string;
  compareFailure: (error: string) => string;
  hideForm: string;
  showAll: string;
}
