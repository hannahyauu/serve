// Initializes or refreshes the recipes collection in serve without creating duplicates.
const path = require('path');
const fs = require('fs');
require("dotenv").config({ path: path.join(process.env.HOME, '.cs304env')});
const { Connection } = require('./connection');
const cs304 = require('./cs304');

const mongoUri = cs304.getMongoUri();

// loaded in serve DB + maybe use to update later,... prolly gonna get rid 
async function loadUpdateServeDB() {
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

  let ingredient = 'chicken';
  recipesByIngredient(ingredient);

}

main().catch(console.error);
