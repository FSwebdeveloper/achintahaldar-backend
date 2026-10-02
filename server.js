const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dns = require("dns");
const crypto = require("crypto");

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

// =====================================================
// FRONTEND URL
// =====================================================

const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  "http://localhost:5173";

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);

app.use(express.json());

// =====================================================
// ANONYMOUS VISITOR COOKIE
// =====================================================

const ANONYMOUS_COOKIE_NAME =
  "fswd_visitor_id";

// =====================================================
// GET / CREATE ANONYMOUS ID
// =====================================================
//
// Visitor login না করলেও Like করতে পারবে.
//
// Browser-এর HttpOnly cookie-তে anonymous ID
// রাখা হবে.
//
// Frontend JavaScript এই cookie read করতে পারবে না.
// Backend নিজে cookie read করবে.
// =====================================================

function getAnonymousId(req, res) {
  let anonymousId = null;

  // ===================================================
  // READ COOKIE
  // ===================================================

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
        name ===
        ANONYMOUS_COOKIE_NAME
      ) {
        anonymousId = decodeURIComponent(
          valueParts.join("=")
        );

        break;
      }
    }
  }

  // ===================================================
  // IF COOKIE ALREADY EXISTS
  // ===================================================

  if (anonymousId) {
    return anonymousId;
  }

  // ===================================================
  // CREATE NEW ANONYMOUS ID
  // ===================================================

  anonymousId =
    crypto.randomUUID();

  // ===================================================
  // ENVIRONMENT
  // ===================================================

  const isProduction =
    process.env.NODE_ENV ===
    "production";

  // ===================================================
  // COOKIE OPTIONS
  // ===================================================

  const cookieOptions = [
    `${ANONYMOUS_COOKIE_NAME}=${encodeURIComponent(
      anonymousId
    )}`,

    "Path=/",

    "HttpOnly",

    // 1 year
    "Max-Age=31536000",
  ];

  // ===================================================
  // PRODUCTION
  // ===================================================

  if (isProduction) {
    cookieOptions.push("Secure");

    // Frontend and backend are different domains
    cookieOptions.push(
      "SameSite=None"
    );
  }

  // ===================================================
  // DEVELOPMENT
  // ===================================================

  else {
    cookieOptions.push(
      "SameSite=Lax"
    );
  }

  // ===================================================
  // SEND COOKIE
  // ===================================================

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
      // =================================================
      // NAME
      // =================================================

      name: {
        type: String,
        required: true,
        trim: true,
      },

      // =================================================
      // EMAIL
      // =================================================

      email: {
        type: String,
        required: true,
        trim: true,
      },

      // =================================================
      // PROFESSION
      // =================================================

      post: {
        type: String,
        required: true,
        trim: true,
      },

      // =================================================
      // CATEGORY
      // =================================================

      category: {
        type: String,
        required: true,
        trim: true,
      },

      // =================================================
      // RATING
      // =================================================

      rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5,
      },

      // =================================================
      // REVIEW
      // =================================================

      review: {
        type: String,
        required: true,
        trim: true,
      },

      // =================================================
      // PROFILE IMAGE
      // =================================================

      imgURL: {
        type: String,
        default:
          "https://lh3.googleusercontent.com/a/default-user=s32-cc",
      },

      // =================================================
      // ANONYMOUS VISITOR ID
      // =================================================
      //
      // Review submit করার সময় visitor-এর
      // anonymous ID এখানে save হবে.
      //
      // এটি Like system-এর anonymous identity
      // এবং review-এর সাথে visitor-এর relationship
      // রাখতে সাহায্য করবে.
      // =================================================

      anonymousId: {
        type: String,
        required: true,
        index: true,
      },

      // =================================================
      // LIKE COUNT
      // =================================================

      likes: {
        type: Number,
        default: 0,
        min: 0,
      },

      // =================================================
      // REVIEW APPROVAL
      // =================================================

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
//
// এখানে Like-এর আলাদা document থাকবে.
//
// One visitor + one review = one Like.
//
// Example:
//
// reviewId + anonymousId
//
// একই combination আবার তৈরি হতে পারবে না.
// =====================================================

const reviewLikeSchema =
  new mongoose.Schema(
    {
      // =================================================
      // REVIEW ID
      // =================================================

      reviewId: {
        type:
          mongoose.Schema.Types.ObjectId,
        ref: "Review",
        required: true,
      },

      // =================================================
      // ANONYMOUS VISITOR ID
      // =================================================

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
// UNIQUE INDEX
// =====================================================
//
// একই visitor একই review-তে
// একটির বেশি Like document তৈরি করতে পারবে না.
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
  async (req, res) => {
    try {
      // ===============================================
      // GET ANONYMOUS ID
      // ===============================================

      const anonymousId =
        getAnonymousId(req, res);

      // ===============================================
      // GET DATA FROM FRONTEND
      // ===============================================

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
      // REQUIRED FIELD CHECK
      // ===============================================

      if (
        !name ||
        !email ||
        !post ||
        !category ||
        !rating ||
        !review
      ) {
        return res.status(400).json({
          message:
            "Please fill all required fields.",
        });
      }

      // ===============================================
      // CREATE NEW REVIEW
      // ===============================================

      const newReview =
        new Review({
          name: name.trim(),

          email: email.trim(),

          post: post.trim(),

          category: category.trim(),

          rating: Number(rating),

          review: review.trim(),

          imgURL:
            imgURL ||
            "https://lh3.googleusercontent.com/a/default-user=s32-cc",

          // =========================================
          // ANONYMOUS ID
          // =========================================

          anonymousId,

          // =========================================
          // NEW REVIEW NEEDS APPROVAL
          // =========================================

          approved: false,

          // =========================================
          // INITIAL LIKE COUNT
          // =========================================

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

      res.status(201).json({
        message:
          "Review submitted successfully. Waiting for approval.",

        review: savedReview,
      });
    } catch (error) {
      console.error(
        "POST review error:",
        error
      );

      res.status(500).json({
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
      // ===============================================
      // CREATE / GET ANONYMOUS ID
      // ===============================================
      //
      // এটি গুরুত্বপূর্ণ।
      //
      // Visitor প্রথমবার website-এ reviews load
      // করলে anonymous cookie তৈরি হতে পারে.
      // ===============================================

      getAnonymousId(req, res);

      // ===============================================
      // ONLY APPROVED REVIEWS
      // ===============================================

      const reviews =
        await Review.find({
          approved: true,
        })
          .select(
            "-anonymousId"
          )
          .sort({
            createdAt: -1,
          });

      // ===============================================
      // SEND REVIEWS
      // ===============================================

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
//
// PUT
// /api/reviews/:id/like
//
// No email required.
//
// Backend automatically identifies visitor
// using anonymous HttpOnly cookie.
// =====================================================

app.put(
  "/api/reviews/:id/like",
  async (req, res) => {
    try {
      // ===============================================
      // GET ANONYMOUS ID
      // ===============================================

      const anonymousId =
        getAnonymousId(req, res);

      // ===============================================
      // REVIEW ID
      // ===============================================

      const reviewId =
        req.params.id;

      // ===============================================
      // CHECK VALID MONGODB ID
      // ===============================================

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

      // ===============================================
      // FIND REVIEW
      // ===============================================

      const review =
        await Review.findById(
          reviewId
        );

      // ===============================================
      // REVIEW NOT FOUND
      // ===============================================

      if (!review) {
        return res.status(404).json({
          message:
            "Review not found.",
        });
      }

      // ===============================================
      // CHECK EXISTING LIKE
      // ===============================================

      const existingLike =
        await ReviewLike.findOne({
          reviewId,
          anonymousId,
        });

      // ===============================================
      // UNLIKE
      // ===============================================

      if (existingLike) {
        // ---------------------------------------------
        // DELETE LIKE DOCUMENT
        // ---------------------------------------------

        await ReviewLike.deleteOne({
          _id: existingLike._id,
        });

        // ---------------------------------------------
        // DECREASE LIKE COUNT
        // ---------------------------------------------

        review.likes =
          Math.max(
            0,
            Number(review.likes || 0) - 1
          );

        await review.save();

        // ---------------------------------------------
        // RESPONSE
        // ---------------------------------------------

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
        // =============================================
        // DUPLICATE LIKE
        // =============================================

        if (
          error.code === 11000
        ) {
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

      // ===============================================
      // INCREASE LIKE COUNT
      // ===============================================

      review.likes =
        Number(review.likes || 0) + 1;

      await review.save();

      // ===============================================
      // RESPONSE
      // ===============================================

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
//
// GET
// /api/reviews/:id/like-status
//
// Frontend page load করার সময় এটি check করবে
// visitor already Like করেছে কি না.
// =====================================================

app.get(
  "/api/reviews/:id/like-status",
  async (req, res) => {
    try {
      // ===============================================
      // GET ANONYMOUS ID
      // ===============================================

      const anonymousId =
        getAnonymousId(req, res);

      // ===============================================
      // REVIEW ID
      // ===============================================

      const reviewId =
        req.params.id;

      // ===============================================
      // CHECK VALID MONGODB ID
      // ===============================================

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

      // ===============================================
      // FIND REVIEW
      // ===============================================

      const review =
        await Review.findById(
          reviewId
        );

      // ===============================================
      // REVIEW NOT FOUND
      // ===============================================

      if (!review) {
        return res.status(404).json({
          message:
            "Review not found.",
        });
      }

      // ===============================================
      // CHECK LIKE
      // ===============================================

      const existingLike =
        await ReviewLike.findOne({
          reviewId,
          anonymousId,
        });

      // ===============================================
      // RESPONSE
      // ===============================================

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
// MONGODB CONNECTION
// =====================================================

mongoose
  .connect(process.env.MONGO_URI)

  .then(() => {
    console.log(
      "✅ MongoDB Atlas connected successfully"
    );

    // ===============================================
    // START SERVER
    // ===============================================

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