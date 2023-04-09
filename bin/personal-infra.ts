import * as cdk from "aws-cdk-lib";
import { ProxyStack } from "../lib/proxy-stack";
import { VpcStack } from "../lib/vpc-stack";

const app = new cdk.App();

const vpcStack = new VpcStack(app, "VpcStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

const proxyStack = new ProxyStack(app, "ProxyStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  vpc: vpcStack.vpc,
});
