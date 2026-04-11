package tn.insat.tp3;

import org.apache.spark.sql.Dataset;
import org.apache.spark.sql.Row;
import org.apache.spark.sql.SparkSession;
import org.apache.spark.sql.streaming.OutputMode;
import org.apache.spark.sql.streaming.StreamingQuery;
import org.apache.spark.sql.types.DataTypes;
import org.apache.spark.sql.types.StructType;

import static org.apache.spark.sql.functions.*;

public class StreamingAQI {

    public static void main(String[] args) throws Exception {
        // Initialize Spark Session
        SparkSession spark = SparkSession.builder()
                .appName("Vietnam AQI Real-Time Streaming")
                .master("local[*]")
                .getOrCreate();

        // 1. Defining the Schema for incoming Kafka JSON Data
        StructType jsonSchema = new StructType()
                .add("timestamp", DataTypes.TimestampType)
                .add("station_id", DataTypes.StringType)
                .add("pm25", DataTypes.DoubleType);

        // 2. Read continuous stream from Kafka
        // Requirement 5: Structured Streaming
        Dataset<Row> kafkaStream = spark.readStream()
                .format("kafka")
                .option("kafka.bootstrap.servers", "localhost:9092")
                .option("subscribe", "vn_weather_stream")
                .option("startingOffsets", "latest")
                .load();

        // Parse JSON from Kafka value
        Dataset<Row> parsedStream = kafkaStream
                .selectExpr("CAST(value AS STRING)")
                .select(from_json(col("value"), jsonSchema).alias("data"))
                .select("data.*");

        // 3. Load static Geography Data from HDFS (Distributed path)
        Dataset<Row> stationsDf = spark.read()
                .option("header", "true")
                .csv("hdfs://localhost:9000/user/data/static/vietnam_stations.csv");

        // Requirement 3: Broadcast Join (Highly Optimized)
        // Broadcasting the small CSV so all worker nodes check station_id instantly
        Dataset<Row> enrichedStream = parsedStream.join(broadcast(stationsDf), "station_id");

        // Requirement 5 & 1: Watermarking & Advanced Aggregations (Window Functions)
        // We calculate the Moving Average of PM2.5 over a 15-minute window for each region
        // We use Watermarking to discard any data arriving more than 2 hours late.
        Dataset<Row> windowedAggregations = enrichedStream
                .withWatermark("timestamp", "2 hours") // Handle late-arriving packets
                .groupBy(
                        window(col("timestamp"), "15 minutes"),
                        col("region")
                )
                .agg(
                        round(avg("pm25"), 2).alias("avg_pm25"),
                        max("pm25").alias("peak_pm25")
                );

        // Requirement 5: Manage state and Output Mode
        // Output mode is "update" to output updated windows to sink only       
        StreamingQuery query = windowedAggregations.writeStream()
                .outputMode(OutputMode.Update())
                .format("mongo") // Outputting successfully to MongoDB!
                .option("spark.mongodb.output.uri", "mongodb+srv://tuyen:tuyen@cluster0.tkzrw9q.mongodb.net/")
                .option("spark.mongodb.output.database", "Big_Data")
                .option("spark.mongodb.output.collection", "AQIStream")
                // Requirement 5: Exactly-once semantics via distributed Checkpointing on HDFS
                .option("checkpointLocation", "hdfs://localhost:9000/checkpoints/aqi_stream_mongo")
                .start();

        query.awaitTermination();
    }
}
