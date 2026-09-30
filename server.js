const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dns = require("dns");

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
// MIDDLEWARE
// =====================================================

app.use(cors());

app.use(express.json());

// =====================================================
// REVIEW SCHEMA
// =====================================================

const reviewSchema = new mongoose.Schema(
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
    // LIKE COUNT
    // =================================================

    likes: {
      type: Number,
      default: 0,
    },

    // =================================================
    // WHO LIKED THE REVIEW
    // =================================================

    likedBy: {
      type: [String],
      default: [],
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

const Review = mongoose.model(
  "Review",
  reviewSchema
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

      const newReview = new Review({
        name: name.trim(),

        email: email.trim(),

        post: post.trim(),

        category: category.trim(),

        rating: Number(rating),

        review: review.trim(),

        imgURL:
          imgURL ||
          "https://lh3.googleusercontent.com/a/default-user=s32-cc",

        // New review needs approval
        approved: false,

        // Initial like data
        likes: 0,

        likedBy: [],
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
      // ONLY APPROVED REVIEWS
      // ===============================================

      const reviews =
        await Review.find({
          approved: true,
        }).sort({
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

app.put(
  "/api/reviews/:id/like",
  async (req, res) => {
    try {
      // ===============================================
      // REVIEW ID
      // ===============================================

      const reviewId =
        req.params.id;

      // ===============================================
      // USER EMAIL
      // ===============================================

      const { email } = req.body;

      // ===============================================
      // CHECK EMAIL
      // ===============================================

      if (!email) {
        return res.status(400).json({
          message:
            "Email is required.",
        });
      }

      // ===============================================
      // CLEAN EMAIL
      // ===============================================

      const userEmail =
        email.trim();

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
      // OWN REVIEW CHECK
      // ===============================================

      if (
        review.email.toLowerCase() ===
        userEmail.toLowerCase()
      ) {
        return res.status(403).json({
          message:
            "You cannot like your own review.",
        });
      }

      // ===============================================
      // CHECK ALREADY LIKED
      // ===============================================

      const alreadyLiked =
        review.likedBy.some(
          (likedEmail) =>
            likedEmail.toLowerCase() ===
            userEmail.toLowerCase()
        );

      // ===============================================
      // UNLIKE
      // ===============================================

      if (alreadyLiked) {
        review.likedBy =
          review.likedBy.filter(
            (likedEmail) =>
              likedEmail.toLowerCase() !==
              userEmail.toLowerCase()
          );

        // Keep likes synchronized
        review.likes =
          review.likedBy.length;

        await review.save();

        return res.status(200).json({
          message:
            "Review unliked.",

          review,
        });
      }

      // ===============================================
      // LIKE
      // ===============================================

      review.likedBy.push(
        userEmail
      );

      // Keep likes synchronized
      review.likes =
        review.likedBy.length;

      await review.save();

      // ===============================================
      // SEND RESPONSE
      // ===============================================

      res.status(200).json({
        message:
          "Review liked.",

        review,
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