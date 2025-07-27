import 'dotenv/config'
import app from './app.js'
import router from './routes/index.js'

// root endpoint
app.get('/', (_, res) => {
  res.end()
})

app.listen(process.env.PORT || 3000, async () => {
  console.log(`server running.... at ${process.env.PORT || 3000}`)
})

app.use('/api/v1', router)
