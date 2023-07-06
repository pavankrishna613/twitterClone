const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const app = express();

const jwt = require("jsonwebtoken");
app.use(express.json());
const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const postUserQuery = `
        INSERT INTO user (username, password, name, gender)
        VALUES ('${username}', '${hashedPassword}', '${name}', '${gender}');
      `;
      const createUser = await db.run(postUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);
  console.log(password);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);

    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { userId } = request.query;
  const limit = 4;
  console.log(userId);
  const tweetsQuery = `
  SELECT
  user.username, tweet.tweet, tweet.date_time
FROM
  follower
  INNER JOIN tweet ON follower.following_user_id = tweet.user_id
  INNER JOIN user ON tweet.user_id = user.user_id
WHERE
  follower.follower_user_id = ${userId}
ORDER BY
  tweet.date_time DESC
LIMIT 4;
    
  `;

  const tweetsResult = await db.all(tweetsQuery);

  const tweets = tweetsResult.map((row) => ({
    username: row.username,
    tweet: row.tweet,
    dateTime: row.date_time,
  }));

  response.json(tweets);
});

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { userId } = request.query;

  const followingQuery = `
    SELECT u.name AS name
    FROM user AS u
    INNER JOIN follower AS f ON u.user_id = f.following_user_id
    WHERE f.follower_user_id = '${userId}';
  `;
  const followingResult = await db.all(followingQuery);

  const followingList = [];
  for (let i = 0; i < followingResult.length; i++) {
    const following = { name: followingResult[i].name };
    followingList.push(following);
  }

  response.send(followingList);
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { userId } = request.query;

  const followersQuery = `
    SELECT u.name AS name
    FROM user AS u
    INNER JOIN follower AS f ON u.user_id = f.follower_user_id
    WHERE f.following_user_id = '${userId}';
  `;
  const followersResult = await db.all(followersQuery);

  const followersList = [];
  for (let i = 0; i < followersResult.length; i++) {
    const follower = { name: followersResult[i].name };
    followersList.push(follower);
  }

  response.send(followersList);
});

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { userId } = request.query;

  const tweetQuery = `
    SELECT t.tweet, COUNT(l.like_id) AS likes, COUNT(r.reply_id) AS replies, t.date_time AS dateTime
    FROM tweet AS t
    LEFT JOIN likes AS l ON t.tweet_id = l.tweet_id
    LEFT JOIN reply AS r ON t.tweet_id = r.tweet_id
    INNER JOIN follower AS f ON t.user_id = f.following_user_id
    WHERE (t.tweet_id = '${tweetId}' AND f.follower_user_id = '${userId}')
  ;`;
  const tweetResult = await db.get(tweetQuery);

  if (tweetResult === undefined) {
    response.status(401);
    response.send("Invalid Request");
    return;
  }

  const tweet = {
    tweet: tweetResult.tweet,
    likes: tweetResult.likes,
    replies: tweetResult.replies,
    dateTime: tweetResult.dateTime,
  };

  response.send(tweet);
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { userId } = request.query;

    const likesQuery = `
    SELECT u.username AS username
    FROM user AS u
    INNER JOIN likes AS l ON u.user_id = l.user_id
    INNER JOIN tweet AS t ON l.tweet_id = t.tweet_id
    INNER JOIN follower AS f ON t.user_id = f.following_user_id
    WHERE (t.tweet_id = '${tweetId}' AND f.follower_user_id = '${userId}')
  ;`;
    const likesResult = await db.all(likesQuery);

    if (!likesResult) {
      response.status(401);
      response.send("Invalid Request");
      return;
    }

    const likes = [];
    for (let i = 0; i < likesResult.length; i++) {
      const username = likesResult[i].username;
      likes.push(username);
    }

    response.send({ likes });
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { userId } = request.query;

    const repliesQuery = `
    SELECT user.name, reply.reply
    FROM reply
    INNER JOIN user ON reply.user_id = user.user_id
    INNER JOIN tweet ON reply.tweet_id = tweet.tweet_id
    INNER JOIN follower ON tweet.user_id = follower.following_user_id
    WHERE tweet.tweet_id = '${tweetId} AND follower.follower_user_id = '${userId}';`;
    const repliesResult = await db.all(repliesQuery);

    if (!repliesResult) {
      response.status(401);
      response.send("Invalid Request");
      return;
    }

    const replies = repliesResult.map((row) => ({
      name: row.name,
      reply: row.reply,
    }));

    response.send({ replies });
  }
);

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { userId } = request.query;

  const tweetsQuery = `
  SELECT t.tweet, COUNT(l.like_id) AS likes, COUNT(r.reply_id) AS replies, t.date_time
FROM tweet AS t
LEFT JOIN 
like AS l ON l.tweet_id = t.tweet_id
LEFT JOIN reply AS r ON r.tweet_id = t.tweet_id
WHERE t.user_id = '${userId}'
GROUP BY t.tweet_id;

    `;
  const tweetsResult = await db.all(tweetsQuery);

  const tweets = tweetsResult.map((row) => ({
    tweet: row.tweet,
    likes: row.likes,
    replies: row.replies,
    dateTime: row.dateTime,
  }));

  response.send(tweets);
});

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { userId } = request.query;
  const { tweet } = request.body;

  const createTweetQuery = `
    INSERT INTO tweet (user_id, tweet, date_time)
    VALUES ('${userId}', '${tweet}', datetime('now'))
  ;`;
  await db.run(createTweetQuery);

  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { userId } = request.query;

    const deleteTweetQuery = `
    DELETE FROM tweet
    WHERE tweet_id = '${tweetId}' AND user_id = '${userId}'
  ;`;
    const result = await db.run(deleteTweetQuery);

    if (result.changes > 0) {
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
