const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dns = require("dns");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const sanitizeHtml = require("sanitize-html");

require("dotenv").config();

// =====================================================
// DNS
// =====================================================

dns.setServers([
  "1.1.1.1",
  "8.8.8.8",
]);

// =====================================================
// APP
// =====================================================

const app = express();

app.set("trust proxy", 1);

// =====================================================
// FRONTEND URL
// =====================================================

const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  "http://localhost:3000";

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);

// Request body size limit
app.use(express.json({ limit: "10kb" }));

// =====================================================
// REVIEW RATE LIMITER
// =====================================================

const reviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    message:
      "Too many review submissions. Please try again after 15 minutes.",
  },
});

// =====================================================
// REVIEW VALIDATION HELPERS
// =====================================================

const ALLOWED_CATEGORIES = [
  "Web Design",
  "Hearing AIDS",
  "Electronics & Accessories",
  "Vintage Audio Collection",
  "Desktop & Laptop",
  "Online Application",
  "Upgrading & Reinstalling",
];

// Remove HTML tags
function cleanText(value) {
  return sanitizeHtml(value.trim(), {
    allowedTags: [],
    allowedAttributes: {},
  }).trim();
}

// Email validation
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// =====================================================
// ANONYMOUS VISITOR COOKIE
// =====================================================

const ANONYMOUS_COOKIE_NAME =
  "fswd_visitor_id";

// =====================================================
// GET / CREATE ANONYMOUS ID
// =====================================================

function getAnonymousId(req, res) {
  let anonymousId = null;

  // READ COOKIE

  const cookieHeader =
    req.headers.cookie;

  if (cookieHeader) {
    const cookies =
      cookieHeader.split(";");

    for (const cookie of cookies) {
      const [
        name,
        ...valueParts
      ] = cookie.trim().split("=");

      if (
        name === ANONYMOUS_COOKIE_NAME
      ) {
        try {
          anonymousId = decodeURIComponent(
            valueParts.join("=")
          );
        } catch {
          anonymousId = null;
        }

        break;
      }
    }
  }

  // IF COOKIE EXISTS

  if (
    anonymousId &&
    /^[a-f0-9-]{36}$/i.test(anonymousId)
  ) {
    return anonymousId;
  }

  // CREATE NEW ID

  anonymousId =
    crypto.randomUUID();

  const isProduction =
    process.env.NODE_ENV === "production";

  const cookieOptions = [
    `${ANONYMOUS_COOKIE_NAME}=${encodeURIComponent(
      anonymousId
    )}`,
    "Path=/",
    "HttpOnly",
    "Max-Age=31536000",
  ];

  // PRODUCTION

  if (isProduction) {
    cookieOptions.push("Secure");
    cookieOptions.push("SameSite=None");
  }

  // DEVELOPMENT

  else {
    cookieOptions.push("SameSite=Lax");
  }

  // SEND COOKIE

  res.setHeader(
    "Set-Cookie",
    cookieOptions.join("; ")
  );

  return anonymousId;
}

// =====================================================
// REVIEW SCHEMA
// =====================================================

const reviewSchema =
  new mongoose.Schema(
    {
      // NAME

      name: {
        type: String,
        required: true,
        trim: true,
        minlength: 6,
        maxlength: 50,
      },

      // EMAIL

      email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        maxlength: 254,
      },

      // PROFESSION

      post: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 50,
      },

      // CATEGORY

      category: {
        type: String,
        required: true,
        trim: true,
        enum: ALLOWED_CATEGORIES,
      },

      // RATING

      rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5,
        validate: {
          validator: Number.isInteger,
          message:
            "Rating must be a whole number from 1 to 5.",
        },
      },

      // REVIEW

      review: {
        type: String,
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 500,
      },

      // PROFILE IMAGE

      imgURL: {
        type: String,
        default:
          "https://lh3.googleusercontent.com/a/default-user=s32-cc",
      },

      // ANONYMOUS VISITOR ID

      anonymousId: {
        type: String,
        required: true,
        index: true,
      },

      // LIKE COUNT

      likes: {
        type: Number,
        default: 0,
        min: 0,
      },

      // REVIEW APPROVAL

      approved: {
        type: Boolean,
        default: false,
      },
    },
    {
      timestamps: true,
    }
  );

// =====================================================
// REVIEW MODEL
// =====================================================

const Review =
  mongoose.model(
    "Review",
    reviewSchema
  );

// =====================================================
// REVIEW LIKE SCHEMA
// =====================================================

const reviewLikeSchema =
  new mongoose.Schema(
    {
      // REVIEW ID

      reviewId: {
        type:
          mongoose.Schema.Types.ObjectId,
        ref: "Review",
        required: true,
      },

      // ANONYMOUS VISITOR ID

      anonymousId: {
        type: String,
        required: true,
      },
    },
    {
      timestamps: true,
    }
  );

// =====================================================
// UNIQUE LIKE INDEX
// =====================================================

reviewLikeSchema.index(
  {
    reviewId: 1,
    anonymousId: 1,
  },
  {
    unique: true,
  }
);

// =====================================================
// REVIEW LIKE MODEL
// =====================================================

const ReviewLike =
  mongoose.model(
    "ReviewLike",
    reviewLikeSchema
  );

// =====================================================
// TEST ROUTE
// =====================================================

app.get("/", (req, res) => {
  res.send(
    "FSWebDeveloper backend server is running successfully."
  );
});

// =====================================================
// POST REVIEW
// =====================================================

app.post(
  "/api/reviews",
  reviewLimiter,
  async (req, res) => {
    try {
      // ===============================================
      // REQUEST BODY VALIDATION
      // ===============================================

      if (
        !req.body ||
        typeof req.body !== "object" ||
        Array.isArray(req.body)
      ) {
        return res.status(400).json({
          message: "Invalid request body.",
        });
      }

      // Allowed fields

      const allowedFields = [
        "name",
        "email",
        "post",
        "category",
        "rating",
        "review",
        "imgURL",
      ];

      const unknownFields =
        Object.keys(req.body).filter(
          (field) =>
            !allowedFields.includes(field)
        );

      if (unknownFields.length > 0) {
        return res.status(400).json({
          message:
            "Request contains unsupported fields.",
        });
      }

      // GET DATA

      const {
        name,
        email,
        post,
        category,
        rating,
        review,
        imgURL,
      } = req.body;

      // ===============================================
      // REQUIRED FIELD + DATA TYPE VALIDATION
      // ===============================================

      const requiredFields = {
        name,
        email,
        post,
        category,
        review,
      };

      for (
        const [field, value]
        of Object.entries(requiredFields)
      ) {
        if (
          typeof value !== "string" ||
          !value.trim()
        ) {
          return res.status(400).json({
            message:
              `${field} is required and must be text.`,
          });
        }
      }

      if (
        rating === undefined ||
        rating === null ||
        rating === ""
      ) {
        return res.status(400).json({
          message: "Rating is required.",
        });
      }

      // ===============================================
      // CLEAN INPUTS (XSS DEFENCE)
      // ===============================================

      const cleanName =
        cleanText(name);

      const cleanEmail =
        email.trim().toLowerCase();

      const cleanPost =
        cleanText(post);

      const cleanCategory =
        category.trim();

      const cleanReview =
        cleanText(review);

      // ===============================================
      // NAME VALIDATION
      // ===============================================

      if (
        cleanName.length < 6 ||
        cleanName.length > 50
      ) {
        return res.status(400).json({
          message:
            "Name must be between 6 and 50 characters.",
        });
      }

      // ===============================================
      // EMAIL VALIDATION
      // ===============================================

      if (
        cleanEmail.length > 254 ||
        !isValidEmail(cleanEmail)
      ) {
        return res.status(400).json({
          message:
            "Please provide a valid email address.",
        });
      }

      // ===============================================
      // PROFESSION VALIDATION
      // ===============================================

      if (
        cleanPost.length < 2 ||
        cleanPost.length > 50
      ) {
        return res.status(400).json({
          message:
            "Profession must be between 2 and 50 characters.",
        });
      }

      // ===============================================
      // CATEGORY VALIDATION
      // ===============================================

      if (
        !ALLOWED_CATEGORIES.includes(
          cleanCategory
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid review category.",
        });
      }

      // ===============================================
      // RATING VALIDATION
      // ===============================================

      const ratingNumber =
        Number(rating);

      if (
        !Number.isInteger(ratingNumber) ||
        ratingNumber < 1 ||
        ratingNumber > 5
      ) {
        return res.status(400).json({
          message:
            "Rating must be a whole number from 1 to 5.",
        });
      }

      // ===============================================
      // REVIEW VALIDATION
      // ===============================================

      if (
        !cleanReview ||
        cleanReview.length > 500
      ) {
        return res.status(400).json({
          message:
            "Review is required and cannot exceed 500 characters.",
        });
      }

      // WORD COUNT

      const reviewWords =
        cleanReview
          .split(/\s+/)
          .filter(Boolean);

      if (reviewWords.length < 6) {
        return res.status(400).json({
          message:
            "Review must contain at least 6 words.",
        });
      }

      // ===============================================
      // OPTIONAL IMAGE URL VALIDATION
      // ===============================================

      let safeImgURL =
        "https://lh3.googleusercontent.com/a/default-user=s32-cc";

      if (
        imgURL !== undefined &&
        imgURL !== null &&
        imgURL !== ""
      ) {
        if (
          typeof imgURL !== "string" ||
          imgURL.length > 2048
        ) {
          return res.status(400).json({
            message:
              "Invalid profile image URL.",
          });
        }

        try {
          const parsedImageURL =
            new URL(imgURL);

          if (
            !["http:", "https:"].includes(
              parsedImageURL.protocol
            )
          ) {
            throw new Error(
              "Unsupported image URL protocol."
            );
          }

          safeImgURL =
            parsedImageURL.href;

        } catch {
          return res.status(400).json({
            message:
              "Profile image must be a valid HTTP or HTTPS URL.",
          });
        }
      }

      // ===============================================
      // DUPLICATE EMAIL PREVENTION
      // ===============================================

      const existingReview =
        await Review.findOne({
          email: cleanEmail,
        })
          .collation({
            locale: "en",
            strength: 2,
          })
          .select("_id");

      if (existingReview) {
        return res.status(409).json({
          message:
            "A review has already been submitted with this email address.",
        });
      }

      // ===============================================
      // GET ANONYMOUS ID
      // ===============================================

      const anonymousId =
        getAnonymousId(req, res);

      // ===============================================
      // CREATE NEW REVIEW
      // ===============================================

      const newReview =
        new Review({
          name: cleanName,
          email: cleanEmail,
          post: cleanPost,
          category: cleanCategory,
          rating: ratingNumber,
          review: cleanReview,
          imgURL: safeImgURL,
          anonymousId,

          // Always pending approval

          approved: false,

          // Initial likes

          likes: 0,
        });

      // ===============================================
      // SAVE TO MONGODB ATLAS
      // ===============================================

      const savedReview =
        await newReview.save();

      // ===============================================
      // RESPONSE
      // ===============================================

      return res.status(201).json({
        message:
          "Review submitted successfully. Waiting for approval.",

        review: {
          _id: savedReview._id,
          approved: savedReview.approved,
        },
      });

    } catch (error) {
      console.error(
        "POST review error:",
        error
      );

      // DUPLICATE KEY ERROR

      if (error.code === 11000) {
        return res.status(409).json({
          message:
            "A review has already been submitted with this email address.",
        });
      }

      // MONGOOSE VALIDATION ERROR

      if (
        error.name === "ValidationError" ||
        error.name === "CastError"
      ) {
        return res.status(400).json({
          message:
            "Review data is invalid. Please check your entries.",
        });
      }

      return res.status(500).json({
        message:
          "Failed to submit review.",
      });
    }
  }
);

// =====================================================
// GET APPROVED REVIEWS
// =====================================================

app.get(
  "/api/reviews",
  async (req, res) => {
    try {
      // CREATE / GET ANONYMOUS ID

      getAnonymousId(req, res);

      // ONLY APPROVED REVIEWS

      const reviews =
        await Review.find({
          approved: true,
        })
          .select(
            "-anonymousId -email"
          )
          .sort({
            createdAt: -1,
          });

      // RESPONSE

      res.status(200).json({
        reviews,
      });

    } catch (error) {
      console.error(
        "GET reviews error:",
        error
      );

      res.status(500).json({
        message:
          "Failed to get reviews.",
      });
    }
  }
);

// =====================================================
// LIKE / UNLIKE REVIEW
// =====================================================

app.put(
  "/api/reviews/:id/like",
  async (req, res) => {
    try {
      // GET ANONYMOUS ID

      const anonymousId =
        getAnonymousId(req, res);

      // REVIEW ID

      const reviewId =
        req.params.id;

      // CHECK VALID MONGODB ID

      if (
        !mongoose.Types.ObjectId.isValid(
          reviewId
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid review ID.",
        });
      }

      // FIND REVIEW

      const review =
        await Review.findById(
          reviewId
        );

      // REVIEW NOT FOUND

      if (!review) {
        return res.status(404).json({
          message:
            "Review not found.",
        });
      }

      // CHECK EXISTING LIKE

      const existingLike =
        await ReviewLike.findOne({
          reviewId,
          anonymousId,
        });

      // ===============================================
      // UNLIKE
      // ===============================================

      if (existingLike) {
        await ReviewLike.deleteOne({
          _id: existingLike._id,
        });

        review.likes =
          Math.max(
            0,
            Number(review.likes || 0) - 1
          );

        await review.save();

        return res.status(200).json({
          message:
            "Review unliked.",

          liked: false,

          likes: review.likes,
        });
      }

      // ===============================================
      // LIKE
      // ===============================================

      try {
        await ReviewLike.create({
          reviewId,
          anonymousId,
        });

      } catch (error) {
        if (error.code === 11000) {
          return res.status(200).json({
            message:
              "Review already liked.",

            liked: true,

            likes:
              review.likes || 0,
          });
        }

        throw error;
      }

      // INCREASE LIKE COUNT

      review.likes =
        Number(review.likes || 0) + 1;

      await review.save();

      // RESPONSE

      return res.status(200).json({
        message:
          "Review liked.",

        liked: true,

        likes: review.likes,
      });

    } catch (error) {
      console.error(
        "LIKE/UNLIKE review error:",
        error
      );

      res.status(500).json({
        message:
          "Failed to like/unlike review.",
      });
    }
  }
);

// =====================================================
// LIKE STATUS
// =====================================================

app.get(
  "/api/reviews/:id/like-status",
  async (req, res) => {
    try {
      // GET ANONYMOUS ID

      const anonymousId =
        getAnonymousId(req, res);

      // REVIEW ID

      const reviewId =
        req.params.id;

      // CHECK VALID MONGODB ID

      if (
        !mongoose.Types.ObjectId.isValid(
          reviewId
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid review ID.",
        });
      }

      // FIND REVIEW

      const review =
        await Review.findById(
          reviewId
        );

      // REVIEW NOT FOUND

      if (!review) {
        return res.status(404).json({
          message:
            "Review not found.",
        });
      }

      // CHECK LIKE

      const existingLike =
        await ReviewLike.findOne({
          reviewId,
          anonymousId,
        });

      // RESPONSE

      res.status(200).json({
        liked:
          Boolean(existingLike),

        likes:
          Number(review.likes || 0),
      });

    } catch (error) {
      console.error(
        "LIKE STATUS error:",
        error
      );

      res.status(500).json({
        message:
          "Failed to get like status.",
      });
    }
  }
);

// =====================================================
// REQUEST / JSON PARSER ERROR HANDLER
// =====================================================

app.use((error, req, res, next) => {
  // BODY TOO LARGE

  if (error.type === "entity.too.large") {
    return res.status(413).json({
      message:
        "Request body is too large.",
    });
  }

  // INVALID JSON

  if (
    error instanceof SyntaxError &&
    error.status === 400 &&
    "body" in error
  ) {
    return res.status(400).json({
      message:
        "Invalid JSON request body.",
    });
  }

  return next(error);
});

// =====================================================
// MONGODB CONNECTION
// =====================================================

mongoose
  .connect(process.env.MONGO_URI)

  .then(() => {
    console.log(
      "✅ MongoDB Atlas connected successfully"
    );

    // START SERVER

    const PORT =
      process.env.PORT || 5000;

    app.listen(
      PORT,
      () => {
        console.log(
          `🚀 FSWebDeveloper server running on port ${PORT}`
        );
      }
    );
  })

  .catch((error) => {
    console.error(
      "❌ MongoDB connection failed"
    );

    console.error(error);
  });