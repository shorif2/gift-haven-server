const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const dotenv = require("dotenv");
const cors = require("cors");
const jwt = require("jsonwebtoken");
dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;
// Middleware
app.use(cors({ origin: "*", optionsSuccessStatus: 200 }));
app.use(express.json());

//token verification
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization) {
    return res.send({ message: "No token found" });
  }
  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_KEY_TOKEN, (err, decoded) => {
    if (err) {
      console.error("Token verification error:", err.message);
      return res.status(403).send({ message: "Invalid Token" });
    }
    req.decoded = decoded;
    next();
  });
};

//verify seller
const verifySeller = async (req, res, next) => {
  const email = req.decoded.email;
  const query = { email: email };
  const user = await userCollection.findOne(query);

  if (user?.role !== "seller") {
    return res.send({ message: "Forbidden access" });
  }
  if (user?.role == "seller" && user?.status == "pending") {
    return res.send({ message: "Your account is pending to add product" });
  }
  next();
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.shfwl8n.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
//collection
const userCollection = client.db("giftHaven").collection("users");
const productCollection = client.db("giftHaven").collection("products");
// db connect
const dbConnect = async () => {
  try {
    await client.connect();
    console.log("MongoDB connected succesfully!!");

    //insert user to database
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "User already exists" });
      } else {
        const response = await userCollection.insertOne(user);
        res.send(response);
      }
    });

    //get user
    app.get("/user", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      res.send(user);
    });

    //get all user
    app.get("/all-users", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    //manage user
    app.patch("/user", async (req, res) => {
      const { userId, action } = req.query;
      const userObjectId = new ObjectId(userId);
      if (action === "remove") {
        const result = await userCollection.deleteOne({ _id: userObjectId });
        res.send(result);
      } else {
        const result = await userCollection.updateOne(
          { _id: userObjectId },
          { $set: { status: action } }
        );
        res.send(result);
      }
    });

    //add product
    app.post("/add-products", verifyJWT, verifySeller, async (req, res) => {
      const product = req.body;
      const result = await productCollection.insertOne(product);
      res.send(result);
    });

    //update product
    app.patch("/update-product", verifyJWT, verifySeller, async (req, res) => {
      const { id } = req.query;
      const updateProduct = req.body;
      const response = await productCollection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: updateProduct }
      );
      res.send(response);
    });

    //delete product
    app.delete("/product", verifyJWT, verifySeller, async (req, res) => {
      const { id } = req.query;
      const response = await productCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(response);
    });

    //get product
    app.get("/my-products", async (req, res) => {
      const email = req.query.email;
      const query = { sellerEmail: email };
      const result = await productCollection.find(query).toArray();
      res.send(result);
    });

    //get single prouct
    app.get("/single-product", async (req, res) => {
      const { id } = req.query;
      const product = await productCollection.findOne(new ObjectId(id));
      res.send(product);
    });

    //all product /all-roducts?title=${search}&sort=${sort}
    app.get("/all-products", async (req, res) => {
      const { name, sort, category, brand } = req.query;
      const query = {};
      if (name) {
        query.name = { $regex: name, $options: "i" };
      }
      if (category) {
        query.category = { $regex: category, $options: "i" };
      }
      if (brand) {
        query.brand = brand;
      }
      const sortOption = sort === "asc" ? 1 : -1;
      const result = await productCollection
        .find(query)
        .sort({ price: sortOption })
        .toArray();

      const productInfo = await productCollection
        .find({}, { projection: { category: 1, brand: 1 } })
        .toArray();
      const totalProducts = await productCollection.countDocuments({ query });
      const brands = [...new Set(productInfo.map((p) => p.brand))];
      const categories = [...new Set(productInfo.map((p) => p.category))];

      res.send(result);
    });
    //qnique category of products
    app.get("/product-categories", async (req, res) => {
      const productInfo = await productCollection.find().toArray();
      const categories = [...new Set(productInfo.map((p) => p.category))];
      res.send(categories);
    });

    // add or remove to cart
    app.put("/manage-cart", async (req, res) => {
      const { userId, productId, action } = req.body;
      const userObjectId = new ObjectId(userId);
      let query;
      if (action === "add") {
        query = { $addToSet: { cart: new ObjectId(productId) } };
      }
      if (action === "remove") {
        query = { $pull: { cart: new ObjectId(productId) } };
      }

      const result = await userCollection.updateOne(
        { _id: userObjectId },
        query
      );
      res.send(result);
    });

    // add or remove to wishlist
    app.put("/manage-wishlist", async (req, res) => {
      const { userId, productId, action } = req.body;
      const userObjectId = new ObjectId(userId);
      let query;
      if (action === "add") {
        query = { $addToSet: { wishlist: new ObjectId(productId) } };
      }
      if (action === "remove") {
        query = { $pull: { wishlist: new ObjectId(productId) } };
      }

      const result = await userCollection.updateOne(
        { _id: userObjectId },
        query
      );
      res.send(result);
    });

    // cart list
    app.get("/cart-list", async (req, res) => {
      const { productIds } = req.query;
      if (!productIds) {
        return;
      }
      const cartIdes = JSON.parse(productIds);
      const objectIds = cartIdes?.map((id) => new ObjectId(id));
      const productList = await productCollection
        .find({ _id: { $in: objectIds } })
        .toArray();
      res.send(productList);
    });
    //wishlist
    app.get("/wishlist-list", async (req, res) => {
      const { productIds } = req.query;
      if (!productIds) {
        return;
      }
      const cartIdes = JSON.parse(productIds);
      const objectIds = cartIdes?.map((id) => new ObjectId(id));
      const productList = await productCollection
        .find({ _id: { $in: objectIds } })
        .toArray();

      res.send(productList);
    });
  } catch (error) {
    console.log(error.name, error.message);
  }
};
dbConnect();

//api
app.get("/", (req, res) => {
  res.send("Gift Haven server is running");
});

// jwt
app.post("/authentication", async (req, res) => {
  const userEmail = req.body;
  //   const token = jwt.sign(userEmail, {
  const token = jwt.sign(userEmail, process.env.ACCESS_KEY_TOKEN, {
    expiresIn: "10d",
  });
  res.send({ token });
});
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
