import multer from "multer";

// Configure multer to store files in memory
const storage = multer.memoryStorage();

// Create the upload middleware instance
// We limit the file size to 5MB to prevent excessive memory/DB usage
export const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Only allow image types
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"));
    }
  },
});
