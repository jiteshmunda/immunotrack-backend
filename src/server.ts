import app from "./app";
import { ENV } from "./config/env";

const PORT = ENV.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
