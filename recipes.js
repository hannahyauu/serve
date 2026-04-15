// Initializes or refreshes the recipes collection in serve without creating duplicates.
// const path = require('path');
// const fs = require('fs');
// const express = require('express');
// const app = express();
// app.use(express.static('public'));
// require("dotenv").config({ path: path.join(process.env.HOME, '.cs304env')});
// const { Connection } = require('./connection');
// const cs304 = require('./cs304');

// app.use(serveStatic('public'));
// app.use(serveStatic('data'));
// const mongoUri = cs304.getMongoUri();

const fs = require('fs');
const path = require('path');
require("dotenv").config({ path: path.join(process.env.HOME, '.cs304env')});
const express = require('express');
const morgan = require('morgan');
const serveStatic = require('serve-static');
const bodyParser = require('body-parser');
const cookieSession = require('cookie-session');

// our modules loaded from cwd
const { Connection } = require('./connection');
const cs304 = require('./cs304');

// create and configure the app
const app = express();

// Morgan reports the final status code of a request's response
app.use(morgan('tiny'));
app.use(cs304.logStartRequest);

// This handles POST data
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(cs304.logRequestData);  // tell the user about any request data

app.use(serveStatic('public'));
app.use(serveStatic('data'));
app.set('view engine', 'ejs');

const mongoUri = cs304.getMongoUri();

// loaded in serve DB + maybe use to update later,... prolly gonna get rid 
async function loadUpdateServeDBrecipes() {
  const db = await Connection.open(mongoUri, 'serve');
  const recipes = db.collection('recipes');

  console.log("Connected to serve DB!");

  const jsonPath = path.join(__dirname, 'recipes.json');
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  await recipes.createIndex({ recipe_id: 1 }, { unique: true });

  let inserted = 0;
  let updated = 0;

  for (const recipe of data) {
    const result = await recipes.updateOne(
      { recipe_id: recipe.recipe_id },
      { $set: recipe },
      { upsert: true }
    );

    if (result.upsertedCount === 1) {
      inserted += 1;
    } else if (result.matchedCount === 1) {
      updated += 1;
    }
  }

  console.log(`Inserted ${inserted} new recipes`);
  console.log(`Updated ${updated} existing recipes`);

  const one = await recipes.findOne();
  console.log(one);
}

// loads Ingredients db 
async function loadUpdateServeDBingredient() {
  const db = await Connection.open(mongoUri, 'serve');
  const ingredients = db.collection('ingredients');
  await ingredients.createIndex({ ingredient_id: 1 }, { unique: true });

  console.log("Connected to serve DB!");

  // const jsonPath = path.join(__dirname, 'recipes.json');
  // const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  // await ingredients.createIndex({ recipe_id: 1 }, { unique: true });

  let inserted = 0;
  let updated = 0;

  let filenames = fs.readdirSync("data/ingredient-images");

  console.log("extracting ingredients");
  filenames.slice(0,2).forEach(async file => {

    const foodDict = {name: file.split(".")[0], imageName: file, expiration: null, amount: null}
    // const result = await ingredients.updateOne(foodDict, upsert: True)
    const result = await ingredients.updateOne(
      { ingredient_id: file.ingredient_id }, /* NEED TO FIX INGREIDNET ID */
      { $set: foodDict },
      { upsert: true }
    );

    console.log(result)
    // console.log(file.split(".")[0]);
    // console.log(foodDict);
    // console.log("ok")
  });

  const testIngredients = [{name: "apple", imgFile: "Apple.png", expiration: "04-22-26", type: "fruit", amount: 2},
                        //  {name: "pear", image: "pear.jpeg", expiration: "04-12-26", type: "fruit", amount: 5},
                        //  {name: "eggs", image: "eggs.jpeg", expiration: "04-30-26", type: "poultry", amount: 12}
                        ];
  // const ingIMGPath = fs.readdirSync("/data/ingredient-images/");

  /* iterate through folder with ingredients and create items to insert in database*/
  // for (ing in ingIMGPath){
    // console.log(ingIMGPath);
  // }

  // for (const recipe of data) {
  //   const result = await recipes.updateOne(
  //     { recipe_id: recipe.recipe_id },
  //     { $set: recipe },
  //     { upsert: true }
  //   );

  //   if (result.upsertedCount === 1) {
    //   inserted += 1;
    // } else if (result.matchedCount === 1) {
    //   updated += 1;
    // }
  // };

//   console.log(`Inserted ${inserted} new recipes`);
//   console.log(`Updated ${updated} existing recipes`);

//   // const one = await recipes.findOne();
//   // console.log(one);
// }

// Gets all recipes in serve DB
async function getAllRecipes() {
    const db = await Connection.open(mongoUri, 'serve');
    return db.collection('recipes').find({}).toArray();
}


// Finds all ingredients with ingredient in ingredient list
async function recipesByIngredient(ingredient) {
    const recipes = await getAllRecipes();

    const filter = recipes.filter(recipe =>
        recipe.cleanedIngredients.map(item =>
            item.toLowerCase().includes(ingredient.toLowerCase())
        )
    );
    console.log(filter);
    await Connection.close();
    }

async function main() {
  console.log('starting function check...\n');

  // let ingredient = 'chicken';
  // recipesByIngredient(ingredient);

  loadUpdateServeDBingredient();

}

main().catch(console.error);
