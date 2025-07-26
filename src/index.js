require('dotenv').config();
const { app } = require('./app');
const { router } = require('./routes/v1.routes');

// root endpoint
app.get('/', (_, res) => {
  res.end();
});

app.listen(process.env.PORT || 3000, async () => {
  console.log(`server running.... at ${process.env.PORT || 3000}`);
});

app.use('/api/v1', router);
